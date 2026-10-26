# Architecture (V3)

## Decision: static, single operator

V2 was a three-service system (Caddy, Fastify + Hocuspocus/Yjs, PostgreSQL) built so many participants could join rooms with roles, tokens, unit ownership, and a private Command 300 workspace. The product requirement is now one instructor operating one board. Everything that existed only to coordinate several people was removed: rooms, PINs, signed tokens, roles and permissions, presence, WebSocket sync, the private 300 document, and the server and database behind them.

What remains is a static React application. The browser holds the working state; durability comes from IndexedDB, and portability from exported scene files. There is no server to secure, migrate, or keep running, and the app works offline once loaded (PWA).

If cross-device sharing becomes a requirement later, it should be added as an explicit "save to MBFD Hub" path behind Hub authentication, not by reviving rooms.

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

- `store/board.ts` (zustand): the board document, undo/redo (structural sharing of immutable object arrays), transient edits for drags and rotations (one history entry per gesture), training clock, snapshots, and timeline recording.
- `store/ui.ts`: tool, selection, view transform, panels, dialogs, drafts, toasts.
- `canvas/SceneStage.tsx`: Konva stage with background, apparatus, hose, symbol, label, and overlay layers. Native pointer handling provides pan, pinch, wheel zoom, marquee, taps, and freehand strokes; Konva handles object dragging and the rotate handle. The view is preserved through resizes and panel changes.
- `lib/workspace.ts`: boot, debounced autosave with visible status, flush on hide, cross-tab change notice (BroadcastChannel), library operations, import/export.

## Testing

- `pnpm test:coverage`: domain, fire-model, store, storage, scene files, formatting, debrief.
- `pnpm test:e2e`: Playwright on desktop (1440×900) and tablet (iPad Pro 11 landscape). Covers first load, repeat placement, selection/drag/rotate/duplicate/undo, forward lay that follows a moved engine, skid load, hose reshaping, calibration, autosave/reload/reset, export/import, training flow, presentation and replay, and a 100-apparatus/40-hose stress scene.
- `playwright.visual.config.ts`: screenshot captures from phone to 4K for design review.

In development builds only, `window.__sim` exposes the stores for tests.
