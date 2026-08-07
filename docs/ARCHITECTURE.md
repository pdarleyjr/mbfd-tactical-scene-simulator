# Architecture and collaboration invariants

## Data path

The browser loads the PWA from Caddy. `/api/*` and `/scenario-assets/*` proxy to Fastify; `/collab` upgrades to the Hocuspocus WebSocket service. Fastify and Hocuspocus share one repository boundary backed by PostgreSQL.

Each training session can own three Yjs documents:

- `scenario`: read-only source-scene state
- `operations`: the shared live fireground
- `300-plan`: Command 300's private plan

The Hocuspocus server derives the session/workspace from the document name, verifies the signed token, refreshes current 300 mode from PostgreSQL, and rejects unauthorized documents. Incoming Sync Step 2 and Yjs Update payloads are applied to a candidate document first. Changed objects must pass the Zod domain schema and ownership policy before the real document changes.

## World and rendering

All objects use one scenario-world coordinate system independent of screen pixels. The stage uses a single pan/zoom transform; map, apparatus, hose, annotations, selection, and presence consume the same transform. Apparatus images are visual footprints with explicit unverified calibration status. Rotation is stored in degrees; hose paths store world-coordinate polylines.

Manual hose endpoints use start/end coupling semantics and search for the nearest free, compatible port in a fixed screen-space snap radius. Connections persist as `{ objectId, portId }` references. Occupancy is derived from those references plus packaged-evolution port state, allowing separate gated-wye outlets to be used independently.

## Persistence and replay

Yjs binary state is stored by document name. Browsers also keep Yjs documents in IndexedDB for reconnect/offline continuity. Bootstrap metadata is cached locally so an already-open session can recover its scene during a temporary outage. Every accepted semantic change creates an attributed session event with elapsed time, workspace, actor, object ID, and object type. Review exports the event stream as JSON or CSV.
