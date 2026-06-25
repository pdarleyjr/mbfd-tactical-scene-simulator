/// <reference types="@cloudflare/workers-types" />
import { ScenarioRoom } from "./ScenarioRoom";

export interface Env {
  SCENARIO_ROOMS: DurableObjectNamespace;
  ASSETS: { fetch: typeof fetch };
}

// Export Durable Object for Cloudflare's runtime to bind
export { ScenarioRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket routing: match /ws/:roomCode
    if (url.pathname.startsWith("/ws/")) {
      const roomCode = url.pathname.substring(4).toUpperCase();
      
      if (!roomCode || roomCode.length < 4 || roomCode.length > 16) {
        return new Response("Invalid Scenario Room Code", { status: 400 });
      }

      // Check if it's a websocket connection upgrade request
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Websocket Upgrade Required", { status: 426 });
      }

      // Route to Durable Object matching roomCode
      const id = env.SCENARIO_ROOMS.idFromName(roomCode);
      const stub = env.SCENARIO_ROOMS.get(id);

      return stub.fetch(request);
    }

    // 2. Serve static assets otherwise
    try {
      return await env.ASSETS.fetch(request);
    } catch (e: any) {
      return new Response("Asset not found or server error: " + e.message, { status: 404 });
    }
  }
};
