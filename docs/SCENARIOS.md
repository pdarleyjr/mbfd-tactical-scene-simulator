# Creating and maintaining scenarios

## On a training device (no code)

1. Open the scene library (click the scenario title, top left).
2. **New scenario from an image**: choose an aerial photo or site plan and give it a title.
3. Open **⋯ → Scenario settings** to add dispatch information, injects (optionally with an automatic reveal time), benchmarks, an initial-conditions video, wind/north/weather, hose loads, and verified apparatus lengths.
4. Calibrate: **Measure → Calibrate map**, tap both ends of a distance you know is correct on that image, enter the feet.
5. Place any fixed elements (hydrants, markers), then **Download scene file** to keep a master copy. Import it on any other device.

Boards are working copies. Use **Duplicate** in the library to branch a variation, and **Reset to original scenario** to return a built-in template board to its starting state (your layout is snapshotted first and Undo works).

## As a built-in template (code)

Built-in templates ship with the app and cannot be overwritten from the UI.

1. Put original masters in `data/assets/source/` and optimized runtime files in `apps/web/public/scenario-assets/<scenario>/` (see `tools/process-seed-assets.ps1`; record hashes in a manifest).
2. Add a file beside `apps/web/src/templates/waterfront-estate.ts` exporting a `ScenarioTemplate` with a unique `id`, the `scenario` settings, and any starting `objects`.
3. Register it in `apps/web/src/templates/index.ts`.
4. Easiest path: build the scenario in the UI, download the scene file, and copy its `board.scenario` and `board.objects` into the template.

## Importing V2 scenarios

The importer accepts the V2 `GET /api/scenarios` response (`{ "items": [...] }`) or a single V2 scenario record. Static objects, injects, benchmarks, dispatch, and media URLs carry over; V2 attribution fields are dropped; hose bundles (which had no geometry) are reported and skipped. `data/migration/production-scenarios-2026-10-26.json` is the export taken from production before the rewrite.

What that export showed: the live Waterfront Estate record had its title changed to "Test" and one instructor-placed hydrant at (1044, 719). V3's built-in template keeps the original title and includes that hydrant as H1. A second, empty "New Tactical Scenario" record existed and was not carried forward. Archived scenarios, rooms, sessions, events, and collaboration documents are not exposed by the public API and remain in the V2 PostgreSQL volume.
