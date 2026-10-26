# MBFD Tactical Scene Simulator

A single-operator fireground training board for Miami Beach Fire Department. Open the site and the **Residential Structure Fire, Waterfront Estate** scenario is on screen, ready to work: place MBFD apparatus, lay and edit hose, establish water supply, mark the scene, run the training clock and injects, present on a classroom display, and replay the run at the debrief.

No accounts, rooms, PINs, or unit logins. The instructor is the operator.

## What it does

| Area | How it works |
| --- | --- |
| Apparatus | E1–E4 (Pierce PUC), L1 (Pierce Ascendant 100′ tower), L3 (Pierce Arrow XT 100′ ladder), R1–R4 (Horton rescue), using MBFD artwork drawn to real length on a calibrated map. Each unit goes on the scene once: tap it in the tray, tap the map, and it is selected and ready to drag. Tapping a placed unit selects it. Move by dragging or with the inspector's nudge pad (1 or 5 ft, pull forward/back up), rotate with the round handle (15° snaps, Shift for free), the 1° and 15° buttons, or `[` `]`. Undo/redo everything. |
| Hose | Tap the engine or hydrant the line starts from (anywhere on it), tap the route or drag a finger along it, and tap the truck or hydrant it ends at. Trucks never move while laying hose. Preconnect/jumpline 200′ (two 100′ sections), trash line 100′ + 50′ roll, high-rise packs 2 × 100′, 5″ supply in 100′ sections (about 800′ carried; starting at a hydrant is a forward lay, at an engine a reverse lay), 3″ in 50′ sections (800′ per side) to a gated wye. Attack lines finish with a nozzle. Lines longer than the hose carried are flagged. After drawing: drag points, drag a **+** to add a bend, double-tap a bend to remove it, drag an end onto or off a port, extend, straighten. |
| Water supply | Live connectivity analysis: which units are hydrant-supplied, which are on tank water, open ends, attack lines without nozzles, out-of-service hydrants, over-length lays. Animated flow on connected lines. This is connectivity only; **no pressure or flow is calculated**. |
| Measurement | Two-point calibration from a known distance. Before calibration every length reads in map units (`u`) and the UI says "Not calibrated". After: hose routes in feet, section counts, scale bar, ruler, zone radii in feet. |
| Scene | Hydrants (status, instructor notes), markers (command post, staging, RIT, rehab, entry, victim, hazard, fire, exposure, ventilation, division, resizable collapse zone), notes, arrows, pinned measurements, wind and north indicators, weather. Layer toggles. |
| Training | Dispatch text, initial-conditions video, scenario clock, injects (manual or auto at a time) shown as a banner, benchmarks with completion times, snapshots with compare-overlay and restore, debrief notes, downloadable debrief summary. |
| Presentation | Fullscreen classroom view with large title, clock, inject banner, tappable benchmarks, and the live map (still editable). Chrome scales up on 4K panels. |
| Review | Starting the clock records every change. Replay scrubs or plays the actual board state over time with benchmark and inject markers. |
| Saving | Autosave to this browser (IndexedDB) with a visible status. Multiple named boards, duplicate, rename, delete with undo, non-destructive reset to the original scenario, portable scene files (export/import, including uploaded media), PNG export. A notice appears if another tab changes the same board. |
| New scenarios | "New scenario from an image": upload an aerial or plan image, set the title and dispatch, calibrate, and build. Injects, benchmarks, video, hose loads, and verified apparatus lengths are editable in Scenario settings. |

## Sources of the numbers

- Apparatus lengths and driver's-side intake distances come from MBFD apparatus specifications (Pierce PUC 32′9″, intake 13′ from the front; Ascendant 43′, 17′; Arrow XT 42′2″, 16′; Dash 2000 46′, 16′; Horton rescue 25′10″, no pump). Discharge positions are drawn at the pump panel beside the intake.
- Hose sections and loads are MBFD figures and can be adjusted per scenario in Scenario settings.
- The Waterfront Estate image is calibrated from its tennis court (78 ft baseline to baseline); other maps are calibrated by the operator. Until a map is calibrated, lengths read in map units and trucks draw at an approximate size.
- The map only moves when asked to: right/middle-drag, Space + drag, two fingers, the zoom buttons, or the wheel. Dragging empty map selects an area.
- Water supply shows connections only; no pressure or flow is calculated.

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
