# GMKtec production deployment

## Paths and ports

- Checkout: `/opt/mbfd/mbfd-tactical-scene-simulator`
- Compose project: `mbfd-tactical-scene-simulator`
- Host listener: `127.0.0.1:8230`
- Internal API: `app:3000`
- Internal collaboration WebSocket: `app:1234`
- PostgreSQL: `db:5432` (Compose network only)
- Scenario media: `/opt/mbfd/mbfd-tactical-scene-simulator/data/assets`
- PostgreSQL data: Docker volume `mbfd-tactical-scene-simulator_postgres_data`

The existing `mbfdhub-gmktec` Cloudflare Tunnel routes `firesim.mbfdhub.com` to `http://127.0.0.1:8230`. Do not create a public host port for the API, collaboration service, or database.

## First deployment

```bash
install -d -m 700 secrets
openssl rand -base64 48 > secrets/database_password
openssl rand -base64 48 > secrets/session_signing_secret
printf '%s' 'CHOOSE-A-DEPARTMENT-PIN' > secrets/instructor_pin
chmod 600 secrets/*
cp .env.example .env
sed -i "s/^APP_RELEASE=.*/APP_RELEASE=$(git rev-parse HEAD)/" .env
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
curl --fail --silent http://127.0.0.1:8230/api/health
```

Never paste secret values into shell history, logs, Git, Compose YAML, or Cloudflare configuration. On the managed host, create secret files with an interactive no-echo method when practical.

## Migrations and persistence

The app applies Drizzle migrations before listening. PostgreSQL and scenario media are persistent across container replacement. Before a production upgrade:

```bash
docker compose exec -T db pg_dump -U firesim -d firesim -Fc > backups/firesim-$(date +%Y%m%d-%H%M%S).dump
tar -czf backups/firesim-assets-$(date +%Y%m%d-%H%M%S).tgz data/assets
```

Create `backups/` with mode 700 and retain at least the most recent known-good backup off the container filesystem.

## Upgrade

```bash
git fetch --prune origin
git checkout main
git pull --ff-only origin main
sed -i "s/^APP_RELEASE=.*/APP_RELEASE=$(git rev-parse HEAD)/" .env
docker compose build
docker compose up -d --remove-orphans
docker compose ps
curl --fail --silent http://127.0.0.1:8230/api/health
```

Then verify HTTPS, the reported release, static scenario assets, session creation/join, two-browser convergence, Independent 300 isolation, and `wss://firesim.mbfdhub.com/collab` through Cloudflare.

## Rollback

The pre-V2 source is preserved by both branch and annotated tag `legacy-mvp-before-v2`. For a V2 rollback, check out a previously verified V2 commit and rebuild:

```bash
git checkout --detach VERIFIED_COMMIT_SHA
sed -i "s/^APP_RELEASE=.*/APP_RELEASE=$(git rev-parse HEAD)/" .env
docker compose build
docker compose up -d
```

Application rollback does not automatically reverse database migrations. Restore the matching database dump only when the migration history requires it. Never delete the current volume until the backup is verified.

## Cloudflare Tunnel change safety

Back up the existing cloudflared configuration before editing. Add only the `firesim.mbfdhub.com` ingress rule above the terminal catch-all, validate with `cloudflared tunnel ingress validate`, and reload the existing service. Do not alter unrelated ingress rules, routes, DNS records, or Tailscale.
