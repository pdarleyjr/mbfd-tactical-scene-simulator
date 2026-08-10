# MBFD Tactical Scene Simulator V2

An installable, multi-user tactical fireground training system for Miami Beach Fire Department. The V2 application replaces the legacy single-browser Worker app with a React/Konva PWA, an authenticated Hocuspocus/Yjs collaboration service, Fastify APIs, and PostgreSQL persistence on the GMKtec server.

## Operational model

- Participants choose a named training room, then enter their name, role, and assigned unit. A room may be open or protected by an optional instructor-selected numeric PIN; conventional accounts are not required.
- E1, E2, E3, E4, L1, and L3 share one Operations document. Multiple people may join the same company.
- Every object carries creator client, name, unit, and timestamps. Crew members can alter their unit's objects; Command 300 and instructors have broader permissions.
- Independent 300 uses a separate private Yjs document. Live 300 uses Operations. The Independent-to-Live transition snapshots the private document and changes the session to Hybrid so both documents remain available.
- Hoses, ports, couplings, appliances, nozzles, hydrants, and packaged evolutions are semantic domain objects rather than painted pixels.

## Workspace

```text
apps/web                 React 19.2, Vite 8, Konva, PWA, responsive UI
apps/server              Fastify API, Hocuspocus v4, Drizzle/PostgreSQL
packages/domain          Zod contracts and apparatus/evolution catalogs
packages/fire-model      Coupling, snapping, and evolution construction
packages/collaboration   Yjs document layout and authorization policy
data/assets              Reproducible source and optimized seed assets
tools                    Asset-processing scripts
tests/e2e                Desktop/tablet, multi-client, and 300 isolation tests
```

## Local verification

Requires Node 24, pnpm 11, and Chromium for Playwright.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm dev:e2e` runs the web app with an in-memory repository for local interface work. The production server always uses PostgreSQL.

## Production deployment

Production uses `compose.yaml` and three isolated services:

- `mbfd-tactical-scene-simulator-web-1`: Caddy frontend/reverse proxy, loopback port 8230
- `mbfd-tactical-scene-simulator-app-1`: Fastify on 3000 and Hocuspocus on 1234 inside the Compose network
- `mbfd-tactical-scene-simulator-db-1`: PostgreSQL 18 with a named persistent volume

Secrets are file-mounted from the ignored `secrets/` directory. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment, verification, backup, and rollback steps.

## Seed scenario and assets

The initial scenario is **Residential Structure Fire — Waterfront Estate**. `tools/process-seed-assets.ps1` deterministically copies the supplied originals, removes near-transparent apparatus pixels, trims and pads apparatus imagery, generates WebP map derivatives, transcodes the initial-conditions video to 1920×1080 H.264/yuv420p with fast-start, extracts a poster, and writes SHA-256 provenance to `data/assets/seed/manifest.json`.

Apparatus real-world length and width are deliberately marked `unverified-configurable`; no manufacturer dimensions are fabricated. Instructors can configure scene calibration in Scenario Builder.

## Security

- Instructor PIN and session-signing secret are never shipped to the browser or committed.
- Participant and presentation credentials are signed, scoped, expiring tokens.
- The collaboration server independently authorizes every document and validates semantic object updates and ownership before applying them.
- Uploads are size/type checked, written under generated IDs, normalized server-side, and served from a dedicated `/scenario-assets/` namespace.
- Participant routes intentionally do not use Cloudflare Access; the instructor PIN protects control surfaces.
