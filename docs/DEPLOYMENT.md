# Deployment (V3 static app)

V3 is one container: Caddy serving the built app and scenario media on loopback `127.0.0.1:8230`, the same port the `mbfdhub-gmktec` Cloudflare Tunnel already routes `firesim.mbfdhub.com` to. **No tunnel, DNS, or Cloudflare change is needed.**

| | V2 | V3 |
| --- | --- | --- |
| Containers | web (Caddy), app (Fastify + Hocuspocus), db (PostgreSQL 18) | web (Caddy) |
| Secrets | database password, signing secret, instructor PIN | none |
| Persistent server data | PostgreSQL volume, uploaded media | none (scene data is in each browser and in scene files) |
| Health | `/api/health` from Fastify | `/api/health` answered by Caddy (same path, `"mode":"static"`) |

Checkout: `/opt/mbfd/mbfd-tactical-scene-simulator`. Compose project: `mbfd-tactical-scene-simulator`.

## Cutover from V2 (one time)

V2 data is not needed by V3, but it is preserved for rollback and records.

1. **Back up V2 first** (from the checkout, with V2 still running):
   ```bash
   install -d -m 700 backups
   docker compose exec -T db pg_dump -U firesim -d firesim -Fc > backups/firesim-v2-final-$(date +%Y%m%d-%H%M%S).dump
   tar -czf backups/firesim-v2-assets-$(date +%Y%m%d-%H%M%S).tgz data/assets
   curl -fsS http://127.0.0.1:8230/api/scenarios > backups/firesim-v2-scenarios-$(date +%Y%m%d-%H%M%S).json
   ls -l backups/
   ```
   Confirm the dump is non-empty (`pg_restore --list` works on it) before continuing.
2. Note the current V2 commit for rollback: `git rev-parse HEAD` (expected `de8a687…`).
3. Deploy V3:
   ```bash
   git fetch --prune origin
   git checkout main && git pull --ff-only origin main
   export APP_RELEASE=$(git rev-parse HEAD)
   docker compose build
   docker compose up -d --remove-orphans
   docker compose ps
   curl -fsS http://127.0.0.1:8230/api/health
   ```
   `--remove-orphans` stops the V2 `app` and `db` containers. It does **not** delete the `mbfd-tactical-scene-simulator_postgres_data` volume. Never run `docker compose down -v` here.
4. Verify through Cloudflare: `https://firesim.mbfdhub.com/` opens the Waterfront Estate board with no sign-in; `/api/health` reports the new release; apparatus art, background, and video load; an installed PWA updates on next launch (the service worker path `/sw.js` is unchanged, so V2 clients pick up V3 automatically).

## Upgrades

```bash
git pull --ff-only origin main
export APP_RELEASE=$(git rev-parse HEAD)
docker compose build && docker compose up -d
curl -fsS http://127.0.0.1:8230/api/health
```

There are no migrations. Saved boards live in users' browsers; scene schema changes must stay backward compatible or ship an in-app migration (saved boards are validated on load and damaged objects are salvaged individually).

## Rollback

- **To a previous V3 commit:** `git checkout --detach <sha>`, rebuild, `up -d`.
- **To V2:** `git checkout --detach de8a687`, restore the V2 `secrets/` files if they were removed, `docker compose build && docker compose up -d`. The V2 PostgreSQL volume is still present, so V2 resumes with its data. Restore from the dump only if the volume was lost.

## Hosting elsewhere

The build output (`apps/web/dist`) is plain static files and can be served by any static host (for example Cloudflare Pages). Requirements: SPA fallback to `index.html`, `no-cache` on `/sw.js` and `/index.html`, and the security headers in `Caddyfile`.
