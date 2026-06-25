import type { ClientMessage } from "./protocol";

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private roomCode: string;
  private designation: string;
  private isHost: boolean;
  private onMessageCallback: (msg: any) => void;
  private onStatusChangeCallback: (status: "connected" | "disconnected" | "connecting") => void;
  private isIntentionalDisconnect = false;

  constructor(
    roomCode: string,
    designation: string,
    isHost: boolean,
    onMessage: (msg: any) => void,
    onStatusChange: (status: "connected" | "disconnected" | "connecting") => void
  ) {
    this.roomCode = roomCode.toUpperCase();
    this.designation = designation;
    this.isHost = isHost;
    this.onMessageCallback = onMessage;
    this.onStatusChangeCallback = onStatusChange;
    this.connect();
  }

  private connect() {
    this.isIntentionalDisconnect = false;
    this.onStatusChangeCallback("connecting");

    // Establish WebSocket URL
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    // For local development, if we aren't running wrangler dev, we can connect to a specific local or remote server.
    // However, the cleanest way is using window.location.host, but if we run Vite on :5173 and wrangler dev on :8787,
    // we can specify the port 8787 for websockets in local dev. Let's make that robust!
    let host = window.location.host;
    if (isLocal) {
      // If we are on port 5173, point to port 8787 which runs the wrangler server locally
      if (window.location.port === "5173" || window.location.port === "5174") {
        host = `${window.location.hostname}:8787`;
      }
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${host}/ws/${this.roomCode}?designation=${encodeURIComponent(
      this.designation
    )}&isHost=${this.isHost}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.onStatusChangeCallback("connected");
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          this.onMessageCallback(raw);
        } catch (err) {
          console.error("Error parsing message payload:", err);
        }
      };

      this.ws.onclose = () => {
        this.onStatusChangeCallback("disconnected");
        this.stopHeartbeat();
        if (!this.isIntentionalDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket client connection error:", err);
        this.ws?.close();
      };
    } catch (e) {
      console.error("Failed to construct WebSocket client:", e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log("Attempting to reconnect WebSocket...");
      this.connect();
    }, 3000); // Attempt reconnection every 3 seconds
  }

  private startHeartbeat() {
    this.pingTimer = setInterval(() => {
      this.send({ type: "presence_ping" });
    }, 15000); // Ping every 15 seconds
  }

  private stopHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }

  public send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("Cannot send message, WebSocket is not open. State:", this.ws?.readyState);
    }
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    this.stopHeartbeat();
    this.ws?.close();
  }
}
