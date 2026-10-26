# MBFD Tactical Scene Simulator

A single-operator fireground training board for Miami Beach Fire Department. Open the site and the **Residential Structure Fire, Waterfront Estate** scenario is on screen, ready to work: place MBFD apparatus, lay and edit hose, establish water supply, mark the scene, run the training clock and injects, present on a classroom display, and replay the run at the debrief.

No accounts, rooms, PINs, or unit logins. The instructor is the operator.

## What it does

| Area | How it works |
| --- | --- |
| Apparatus | E1, E2, E3, E4, L1, L3 using the department's top-down artwork. Unlimited copies, auto-labelled (E1, E1-2, …) and renamable. Tap a unit then tap the map (repeat taps keep placing), or drag a unit onto the map. Drag to move, round handle to rotate (15° snaps, Shift for free), `[` `]` to rotate, arrows to nudge, Ctrl+D to duplicate, lock, front/back, undo/redo. Optional assignment text under each unit. |
| Hose | 1¾″ attack, 3″ (feeder or attack), 5″ supply. Tap points or drag a finger along the route; start or end on a port to connect. After drawing: drag points, drag a **+** to add a bend, double-tap a bend to remove it, drag an end onto/off a port, extend an open line, straighten. Connected ends follow when apparatus or hydrants move. |
| Evolutions | Forward lay (hydrant → engine), reverse lay (engine → hydrant), jumpline, skid load (3″ feeder → gated wye → 1¾″ attack → nozzle), high-rise pack. Guided prompts, eligible ports highlighted, wyes and nozzles placed automatically, routes compared with the configured load length. Quick actions on a selected engine or hydrant ("Pull skid load", "Forward lay from here"). |
| Water supply | Live connectivity analysis: which units are hydrant-supplied, which are on tank water, open ends, attack lines without nozzles, out-of-service hydrants, over-length lays. Animated flow on connected lines. This is connectivity only; **no pressure or flow is calculated**. |
| Measurement | Two-point calibration from a known distance. Before calibration every length reads in map units (`u`) and the UI says "Not calibrated". After: hose routes in feet, section counts, scale bar, ruler, zone radii in feet. |
| Scene | Hydrants (status, instructor notes), markers (command post, staging, RIT, rehab, entry, victim, hazard, fire, exposure, ventilation, division, resizable collapse zone), notes, arrows, pinned measurements, wind and north indicators, weather. Layer toggles. |
| Training | Dispatch text, initial-conditions video, scenario clock, injects (manual or auto at a time) shown as a banner, benchmarks with completion times, snapshots with compare-overlay and restore, debrief notes, downloadable debrief summary. |
| Presentation | Fullscreen classroom view with large title, clock, inject banner, tappable benchmarks, and the live map (still editable). Chrome scales up on 4K panels. |
| Review | Starting the clock records every change. Replay scrubs or plays the actual board state over time with benchmark and inject markers. |
| Saving | Autosave to this browser (IndexedDB) with a visible status. Multiple named boards, duplicate, rename, delete with undo, non-destructive reset to the original scenario, portable scene files (export/import, including uploaded media), PNG export. A notice appears if another tab changes the same board. |
| New scenarios | "New scenario from an image": upload an aerial or plan image, set the title and dispatch, calibrate, and build. Injects, benchmarks, video, hose loads, and verified apparatus lengths are editable in Scenario settings. |

## What is and is not verified

- Apparatus artwork and unit identities are MBFD's. **Vehicle dimensions are not verified**; units draw at a default size unless you enter a verified length and calibrate the map, and the inspector says which.
- Connection-point locations (rear 5″ intake, pump-panel discharges) are schematic, carried over from V2.
- Hose section lengths (100 ft) and load lengths (forward/reverse lay 500 ft, jumpline 100 ft, skid load 300 + 200 ft, high-rise pack 200 ft) are V2 defaults, editable per scenario, and labelled as configured values.
- Hydrant pressure or flow notes are displayed exactly as the instructor enters them.

## Saved work: this device only

Boards live in the browser that created them. They do **not** sync between devices. To move or archive a board, use **Download scene file** and **Import scene file**. The status pill in the top bar always says where work is saved; private-browsing windows show a warning because nothing is kept.

## Development

Requires Node 22.13+ and pnpm 11 (via `corepack`).

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev              # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm test:coverage    # unit tests, 80% thresholds
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e         # desktop and tablet end-to-end flows
pnpm exec playwright test --config playwright.visual.config.ts   # review screenshots in test-results/visual
```

```text
apps/web                 React 19 + Konva static app (PWA)
  src/canvas             Stage, node renderers, drafting/snapping, edit handles
  src/store              Board document store (undo/redo, timeline) and UI state
  src/lib                IndexedDB storage, scene files, workspace operations, debrief
  src/ui                 Top bar, tool dock and trays, inspector, panels, dialogs
  src/templates          Immutable baseline scenarios (Waterfront Estate)
  public/scenario-assets Runtime media (optimized from data/assets/source)
packages/domain          Zod scene schema v3, apparatus/hose/marker catalogs, V2 importer
packages/fire-model      Geometry, ports, connections, water-supply analysis, measurement, evolutions, timeline diffs
data/assets/source       Original masters (map, video, apparatus art)
data/migration           Export of the live V2 scenarios taken before the V3 rewrite
tools                    Asset pipeline (process-seed-assets.ps1)
tests/e2e                Playwright user-workflow tests
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SCENARIOS.md](docs/SCENARIOS.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
