/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import type { 
  ScenarioRun, 
  RoomRosterEntry, 
  ScenarioObject, 
  HoseLine, 
  TacticalConsideration, 
  TimelineEvent, 
  RadioReport, 
  TacticalPlan, 
  TimerState, 
  Inject 
} from "@/types/scenario";
import { ClientMessageSchema } from "@/realtime/protocol";
import type { ClientMessage, ServerMessage } from "@/realtime/protocol";

interface ConnectionAttachment {
  clientId: string;
  designation: string;
  role: 'Host/Instructor' | 'Participant';
  joinedAt: number;
}

export class ScenarioRoom extends DurableObject {
  ctx: any;
  env: any;
  private state: ScenarioRun | null = null;
  private isInitialized = false;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  private async initialize(roomCode: string) {
    if (this.isInitialized) return;

    // Try to load state from durable storage
    const savedState = await this.ctx.storage.get("room_state") as ScenarioRun | undefined;
    if (savedState) {
      this.state = savedState;
    } else {
      // Create empty/initial scenario state
      this.state = {
        roomCode,
        scenarioId: "uninitialized",
        scenarioTitle: "New Live Scenario",
        objects: {},
        hoses: {},
        tacticalConsiderations: {},
        timer: {
          startedAt: null,
          pausedAt: null,
          accumulatedSeconds: 0,
          isRunning: false
        },
        timeline: [],
        radioReports: [],
        tacticalPlans: [],
        roster: {}
      };
      
      // Log initialization event
      this.logEvent("system", "Scenario room created", "system");
      await this.ctx.storage.put("room_state", this.state);
    }
    
    this.isInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomCode = url.pathname.split("/").pop() || "UNKNOWN";

    await this.initialize(roomCode);

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket Upgrade", { status: 420 });
    }

    const designation = url.searchParams.get("designation") || "User";
    const isHost = url.searchParams.get("isHost") === "true";
    const clientId = Math.random().toString(36).substring(2, 11);

    const pair = new (globalThis as any).WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Accept the WebSocket connection
    this.ctx.acceptWebSocket(server as any);

    // Store per-connection attachment metadata
    const attachment: ConnectionAttachment = {
      clientId,
      designation,
      role: isHost ? "Host/Instructor" : "Participant",
      joinedAt: Date.now()
    };
    server.serializeAttachment(attachment);

    // Update state roster
    if (this.state) {
      // Clear any prior entries for this designation or client
      for (const [id, entry] of Object.entries(this.state.roster)) {
        if (entry.designation === designation) {
          delete this.state.roster[id];
        }
      }

      this.state.roster[clientId] = {
        clientId,
        designation,
        role: attachment.role,
        connectionState: "online",
        lastActionTimestamp: new Date().toISOString()
      };

      if (isHost && !this.state.hostClientId) {
        this.state.hostClientId = clientId;
      }

      // Log join event
      this.logEvent(designation, `${designation} joined the scenario as ${attachment.role}`, clientId);
      await this.saveState();

      // Send initial joined_ack with snapshot
      server.send(JSON.stringify({
        type: "joined_ack",
        payload: {
          clientId,
          roomCode,
          state: this.state
        }
      }));

      // Broadcast roster update to other users
      this.broadcast({
        type: "roster_update",
        payload: Object.values(this.state.roster)
      }, clientId);
    }

    return new Response(null, { status: 101, webSocket: client } as any);
  }

  // Handle messages from client
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    try {
      const rawMsg = JSON.parse(message);
      const parsed = ClientMessageSchema.safeParse(rawMsg);
      if (!parsed.success) {
        ws.send(JSON.stringify({ type: "error", payload: "Invalid message payload schema: " + parsed.error.message }));
        return;
      }

      const clientMsg = parsed.data;
      const attachment = (ws as any).deserializeAttachment() as ConnectionAttachment;
      if (!attachment || !this.state) return;

      // Update active user action timestamp
      if (this.state.roster[attachment.clientId]) {
        this.state.roster[attachment.clientId].lastActionTimestamp = new Date().toISOString();
      }

      await this.handleClientAction(attachment, clientMsg);
    } catch (e: any) {
      ws.send(JSON.stringify({ type: "error", payload: "Error processing socket message: " + e.message }));
    }
  }

  private async handleClientAction(attachment: ConnectionAttachment, msg: ClientMessage) {
    if (!this.state) return;

    const { designation, clientId } = attachment;

    switch (msg.type) {
      case "presence_ping":
        // Just acknowledging active connection
        break;

      case "request_snapshot":
        // Client requested full room state
        this.broadcastToClient(clientId, {
          type: "room_snapshot",
          payload: this.state
        });
        break;

      case "scenario_create":
        this.state.scenarioId = msg.scenarioId;
        this.state.scenarioTitle = msg.title;
        this.logEvent(designation, `Scenario template loaded: ${msg.title}`, clientId);
        this.broadcast({ type: "scenario_patch_broadcast", payload: { scenarioId: msg.scenarioId, scenarioTitle: msg.title } });
        await this.saveState();
        break;

      case "scenario_patch":
        // Overwrite full state from host/instructor
        if (attachment.role === "Host/Instructor") {
          this.state = { ...this.state, ...msg.patch };
          this.broadcast({ type: "room_snapshot", payload: this.state });
          await this.saveState();
        }
        break;

      case "object_add":
        const newObj = msg.object as ScenarioObject;
        this.state.objects[newObj.id] = newObj;
        this.logEvent(designation, `Placed object: ${newObj.label || newObj.type}`, clientId);
        this.broadcast({ type: "object_broadcast", payload: { action: "add", object: newObj } });
        await this.saveState();
        break;

      case "object_update":
        if (this.state.objects[msg.id]) {
          const updatedObj = { ...this.state.objects[msg.id], ...msg.update, updatedAt: new Date().toISOString() };
          this.state.objects[msg.id] = updatedObj;
          this.broadcast({ type: "object_broadcast", payload: { action: "update", id: msg.id, object: updatedObj } });
          await this.saveState();
        }
        break;

      case "object_delete":
        if (this.state.objects[msg.id]) {
          const label = this.state.objects[msg.id].label || this.state.objects[msg.id].type;
          delete this.state.objects[msg.id];
          this.logEvent(designation, `Removed object: ${label}`, clientId);
          this.broadcast({ type: "object_broadcast", payload: { action: "delete", id: msg.id } });
          await this.saveState();
        }
        break;

      case "hose_start":
        const newHose = msg.hose as HoseLine;
        this.state.hoses[newHose.id] = newHose;
        this.broadcast({ type: "hose_broadcast", payload: { action: "start", hose: newHose } });
        await this.saveState();
        break;

      case "hose_update":
        if (this.state.hoses[msg.id]) {
          this.state.hoses[msg.id].points = msg.points;
          this.broadcast({ type: "hose_broadcast", payload: { action: "update", id: msg.id, points: msg.points } });
        }
        break;

      case "hose_complete":
        if (this.state.hoses[msg.id]) {
          this.state.hoses[msg.id].completedAt = new Date().toISOString();
          this.state.hoses[msg.id].isDrawing = false;
          if (msg.connectedFromObjectId) this.state.hoses[msg.id].connectedFromObjectId = msg.connectedFromObjectId;
          if (msg.connectedToObjectId) this.state.hoses[msg.id].connectedToObjectId = msg.connectedToObjectId;
          if (msg.label) this.state.hoses[msg.id].label = msg.label;
          
          const hoseLabel = this.state.hoses[msg.id].label || this.state.hoses[msg.id].hoseType;
          this.logEvent(designation, `Laid hose line: ${hoseLabel}`, clientId);
          this.broadcast({ type: "hose_broadcast", payload: { action: "complete", id: msg.id, hose: this.state.hoses[msg.id] } });
          await this.saveState();
        }
        break;

      case "benchmark_mark":
        const timestamp = new Date().toISOString();
        const elapsed = this.calculateElapsedSeconds();
        const eventId = Math.random().toString(36).substring(2, 9);
        const logDesc = `Benchmark marked: ${msg.name}`;

        this.logEvent(msg.actor, logDesc, clientId, { benchmark: msg.name, assignedUnit: msg.assignedUnit, note: msg.note });
        
        this.broadcast({ 
          type: "benchmark_broadcast", 
          payload: { 
            name: msg.name, 
            actor: msg.actor, 
            assignedUnit: msg.assignedUnit, 
            note: msg.note,
            absoluteTimestamp: timestamp,
            elapsedSeconds: elapsed
          } 
        });
        break;

      case "timer_start":
        if (!this.state.timer.isRunning) {
          this.state.timer.startedAt = new Date().toISOString();
          this.state.timer.isRunning = true;
          this.logEvent(designation, "Scenario timer started", clientId);
          this.broadcast({ type: "timer_broadcast", payload: this.state.timer });
          await this.saveState();
        }
        break;

      case "timer_pause":
        if (this.state.timer.isRunning && this.state.timer.startedAt) {
          const now = Date.now();
          const started = Date.parse(this.state.timer.startedAt);
          const elapsedMs = now - started;
          this.state.timer.accumulatedSeconds += elapsedMs / 1000;
          this.state.timer.startedAt = null;
          this.state.timer.pausedAt = new Date().toISOString();
          this.state.timer.isRunning = false;
          this.logEvent(designation, "Scenario timer paused", clientId);
          this.broadcast({ type: "timer_broadcast", payload: this.state.timer });
          await this.saveState();
        }
        break;

      case "timer_resume":
        if (!this.state.timer.isRunning) {
          this.state.timer.startedAt = new Date().toISOString();
          this.state.timer.pausedAt = null;
          this.state.timer.isRunning = true;
          this.logEvent(designation, "Scenario timer resumed", clientId);
          this.broadcast({ type: "timer_broadcast", payload: this.state.timer });
          await this.saveState();
        }
        break;

      case "timer_reset":
        this.state.timer = {
          startedAt: null,
          pausedAt: null,
          accumulatedSeconds: 0,
          isRunning: false
        };
        this.logEvent(designation, "Scenario timer reset", clientId);
        this.broadcast({ type: "timer_broadcast", payload: this.state.timer });
        await this.saveState();
        break;

      case "inject_reveal":
        const idx = this.state.timeline.findIndex(e => e.id === msg.id);
        this.logEvent(designation, `Instructor revealed inject: ${msg.id}`, clientId);
        this.broadcast({ type: "inject_broadcast", payload: { id: msg.id, revealedAt: new Date().toISOString() } });
        await this.saveState();
        break;

      case "tactical_update":
        const tc = msg.update as TacticalConsideration;
        this.state.tacticalConsiderations[msg.id] = tc;
        this.logEvent(designation, `Updated tactic [${tc.category}] status to: ${tc.status}`, clientId);
        this.broadcast({ type: "tactical_broadcast", payload: { id: msg.id, tactical: tc } });
        await this.saveState();
        break;

      case "radio_report_submit":
        const report = msg.report as RadioReport;
        this.state.radioReports.push(report);
        this.logEvent(designation, `Submitted Initial Radio Report as [${report.commandName}]`, clientId);
        this.broadcast({ type: "timeline_broadcast", payload: this.state.timeline[this.state.timeline.length - 1] });
        await this.saveState();
        break;

      case "tactical_plan_submit":
        const plan = msg.plan as TacticalPlan;
        this.state.tacticalPlans.push(plan);
        this.logEvent(designation, `Submitted Tactical Action Plan`, clientId);
        this.broadcast({ type: "timeline_broadcast", payload: this.state.timeline[this.state.timeline.length - 1] });
        await this.saveState();
        break;
    }
  }

  // Handle client disconnect
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = (ws as any).deserializeAttachment() as ConnectionAttachment;
    if (!attachment || !this.state) return;

    const { clientId, designation } = attachment;

    // Mark as offline or delete
    if (this.state.roster[clientId]) {
      this.state.roster[clientId].connectionState = "offline";
    }

    // Clear host designation if host left
    if (this.state.hostClientId === clientId) {
      this.state.hostClientId = undefined;
    }

    this.logEvent(designation, `${designation} disconnected`, clientId);
    await this.saveState();

    // Broadcast roster update
    this.broadcast({
      type: "roster_update",
      payload: Object.values(this.state.roster)
    });
  }

  async webSocketError(ws: WebSocket, error: any) {
    const attachment = (ws as any).deserializeAttachment() as ConnectionAttachment;
    if (!attachment || !this.state) return;
    this.webSocketClose(ws, 1006, "Abnormal disconnect", false);
  }

  // Helpers
  private logEvent(actor: string, description: string, clientId: string, metadata?: any) {
    if (!this.state) return;

    const event: TimelineEvent = {
      id: Math.random().toString(36).substring(2, 9),
      type: "log",
      description,
      elapsedSeconds: this.calculateElapsedSeconds(),
      absoluteTimestamp: new Date().toISOString(),
      actor,
      metadata
    };

    this.state.timeline.push(event);
    
    // Broadcast the timeline event to everyone
    this.broadcast({
      type: "timeline_broadcast",
      payload: event
    });
  }

  private calculateElapsedSeconds(): number {
    if (!this.state || !this.state.timer) return 0;
    const t = this.state.timer;
    let seconds = t.accumulatedSeconds;
    if (t.isRunning && t.startedAt) {
      seconds += (Date.now() - Date.parse(t.startedAt)) / 1000;
    }
    return Math.floor(seconds);
  }

  private async saveState() {
    if (this.state) {
      await this.ctx.storage.put("room_state", this.state);
    }
  }

  // Broadcast to all connected clients except sender
  private broadcast(message: ServerMessage, excludeClientId?: string) {
    const connections = this.ctx.getWebSockets();
    const strMessage = JSON.stringify(message);

    for (const ws of connections) {
      const attachment = (ws as any).deserializeAttachment() as ConnectionAttachment;
      if (attachment && attachment.clientId !== excludeClientId) {
        try {
          ws.send(strMessage);
        } catch (err) {
          // ignore closed socket send errors
        }
      }
    }
  }

  // Target broadcast to specific client
  private broadcastToClient(targetClientId: string, message: ServerMessage) {
    const connections = this.ctx.getWebSockets();
    const strMessage = JSON.stringify(message);

    for (const ws of connections) {
      const attachment = (ws as any).deserializeAttachment() as ConnectionAttachment;
      if (attachment && attachment.clientId === targetClientId) {
        try {
          ws.send(strMessage);
          break;
        } catch (err) {
          // ignore
        }
      }
    }
  }
}
