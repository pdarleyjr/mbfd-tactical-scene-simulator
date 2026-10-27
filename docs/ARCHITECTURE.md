# Architecture (V3)

## Decision: shared live scenes, no accounts

V2 was a three-service system (Caddy, Fastify + Hocuspocus/Yjs, PostgreSQL) built so many participants could join rooms with roles, tokens, unit ownership, and a private Command 300 workspace. V3 removed all of that: no rooms to join, PINs, signed tokens, roles, unit logins, or database.

What V3 keeps is the simplest form of collaboration: everyone who opens the same link works on the same scene. `/` is the main scene, `/s/<id>` a separate one, and `?view=present` a view-only classroom display of either. There is still nothing to sign in to.

Two parts:

- **apps/web**: the React app. It holds the working board, renders it, and sends what changed.
- **apps/sync**: a small Node service (`ws`, no database). One room per scene id holds the authoritative board in memory, applies changes in arrival order, relays them, and saves to disk.

### Live protocol (`packages/domain/src/sync.ts`)

- A browser connects to `/sync/<sceneId>` and sends `hello` with a seed board. A scene that does not exist yet is created from the seed (the original scenario, or an imported board); otherwise the seed is ignored and the browser receives `state`.
- Changes travel as **patches**: `upserts` and `removes` of scene objects (merged per object, last write wins), an optional `order`, and whole replacements of `scenario`, `training`, `snapshots`, and `name`. While the clock records a run, only new timeline entries are sent (`runAppend`).
- The client keeps a *shadow* of what the server has. Each local change is diffed against the shadow (`diffBoards`) and sent, batched to roughly 30 ms (90 ms during a drag, so others see the unit move). Remote patches are applied without being echoed back.
- While disconnected, edits continue locally. On reconnect the server's state is loaded and the offline edits are re-applied on top, then sent.
- Undo/redo records each local change as a reversible diff (`store/board.ts`), so undo takes back only this browser's own change and never overwrites or brings back something someone else changed or deleted since.
- **Switching scenario** (`switch` message): the server keeps the current board under `parked/<scenario>`, loads the target's parked board (or the template the browser sends), snapshots, and broadcasts `replace` with reason `switch` to everyone. The swap and broadcast happen in one step. Every patch names the scenario it was made on (`on`), so a change that arrives just after a switch is dropped instead of leaking into the other scenario. Switches are paced to one every 2 s per scene, and switches and restores run one at a time. A browser that was disconnected during a switch adopts the new scenario on reconnect and drops edits it made on the old one. Restoring a saved version of a different scenario parks the current one first. A tab running an older release (patches without `on`) is told to reload.
- Flames and smoke plumes are marker types drawn by `canvas/effects.ts` in their own non-interactive Konva layer under units and hose, redrawn about 30 times a second only while at least one is on the map (static with reduced motion). Their tap target lives in the normal symbols layer and carries the transform frame: rotation goes to the marker's `rotation`, the top handle to `stretch` (height relative to width, 0.3–4), the corner to `radius`. The frame is never left scaled.
- The training clock is shared: `startedAt` uses the server's clock (offset learned from `state` and `pong`), so every screen shows the same time.

### Server storage

`DATA_DIR/scenes/<id>/current.json` is written about 600 ms after changes, and at least every 5 s during continuous editing (atomic rename, one write at a time per scene). A damaged file is set aside as `current.json.damaged-<time>` and the newest good snapshot is loaded instead; a scene is never silently reset. `history/` holds automatic snapshots: every 5 minutes while edited, before a replace or restore, when the last person leaves, and on shutdown; the newest 100 are kept. Uploaded media is stored under `DATA_DIR/media/` and served at `/media/<uuid>.<ext>` (PNG/JPEG/WebP up to 40 MB, MP4/WebM up to 95 MB, 8 GB total). Limits: 150 people per scene, 40 connections per address, 500 scenes, 5,000 objects per scene, 4 MB per message, and 80 messages or 16 MB per second per connection. Restores are paced to one every 10 s per scene so they cannot push real history out. A bad frame closes only that connection.

The client keeps every change it sent until the server acknowledges it. After a reconnect, unacknowledged and offline changes are applied on top of the server's state and sent again. If the server refuses a change (too large, over a limit), the browser reloads the server's state and says so. When someone else's change arrives while this browser has changes the server has not applied yet, those local changes are kept, because the server will apply them after the other one; every screen ends up the same. Undo and redo only touch objects that are still exactly as this browser left them.

Each browser also caches the last state of each scene it opened (IndexedDB) so the board appears immediately, before the connection opens.
## Data model

`packages/domain/src/scene.ts` defines schema version 3:

- **Board**: one working copy of a scenario (`id`, `name`, `templateId`, `scenario`, `objects`, `training`, `snapshots`, `run`).
- **Scenario**: title, description, dispatch, background and video media references, world size, calibration (with its reference measurement), conditions, injects, benchmarks, hose loads, and operator-entered apparatus lengths.
- **Objects**: `apparatus`, `hydrant`, `hose`, `appliance` (gated wye), `nozzle`, `marker`, `note`, `arrow`, `measurement`. Hoses store points plus `from`/`to` port references. Ports are derived from the object type and template (`fire-model/ports.ts`), never stored per object, so there is one source of truth for connection geometry.
- **Training**: clock (`running`, `startedAt`, `accumulatedMs`), revealed injects and completed benchmarks with elapsed times, debrief notes.
- **Run**: base objects at clock start plus a diff log (`upserts`/`removes`/`order`) with elapsed times. `sceneAt()` rebuilds the board at any moment for replay.

Templates (`apps/web/src/templates`) are immutable. New boards and "Reset to original scenario" copy from them.

Media references are either `builtin` (a URL under `/scenario-assets/`) or `blob` (an IndexedDB media record for operator uploads). Scene files embed blob media as data URLs.

## Model logic (`packages/fire-model`)

Pure functions, unit tested:

- `reconcileHoses` runs after every change: attached ends are moved onto their ports, references to deleted objects are released, and connected hoses are oriented source → destination (outlet → inlet). It returns the same array when nothing changed, so React and the diff log stay cheap.
- `findSnapTarget` / `eligiblePorts` enforce coupling size and opposite port direction.
- `analyzeWaterSupply` walks connections from hydrants through hoses, wyes, and pumping apparatus, then marks tank-only lines, and reports issues. Connectivity only.
- `readLength` / `readHose` / `scaleBar` never report feet without a calibration.
- `evolutionSteps` describes each packaged evolution as guided steps (start rule, finish rule, load length).

## State and interaction (`apps/web`)

- `store/board.ts` (zustand): the board document, undo/redo as reversible per-change diffs, remote patch application, transient edits for drags and rotations (one history entry per gesture), training clock, snapshots, and timeline recording.
- `store/ui.ts`: tool, selection, view transform, panels, dialogs, drafts, toasts.
- `canvas/SceneStage.tsx`: Konva stage with background, apparatus, hose, symbol, label, and overlay layers. Native pointer handling provides pan, pinch, wheel zoom, marquee, taps, and freehand strokes; Konva handles object dragging and the rotate handle. The view is preserved through resizes and panel changes.
- `lib/live.ts`: the live connection: scene id from the address, hello/state, sending and applying patches, reconnect with backoff, presence, shared clock.
- `lib/workspace.ts`: boot (cached copy, then live), separate scenes, media upload, saved versions, import/export.

## Testing

- `pnpm test:coverage`: domain (including the live patch protocol), fire-model, store, storage, scene files, formatting, debrief, and the sync service (rooms, saving, snapshots, restore, media, limits) against a real WebSocket server.
- `pnpm test:e2e`: Playwright on desktop (1440×900) and tablet (iPad Pro 11 landscape). Covers first load, repeat placement, selection/drag/rotate/duplicate/undo, forward lay that follows a moved engine, skid load, hose reshaping, calibration, autosave/reload/reset, export/import, training flow, presentation and replay, a 100-apparatus/40-hose stress scene, and shared scenes with two browsers: live edits both ways, per-person undo, presence, separate scenes, the view-only classroom display, and recovery from a dropped connection. Each test runs in its own scene.
- `playwright.visual.config.ts`: screenshot captures from phone to 4K for design review.

In development builds only, `window.__sim` exposes the stores for tests.
