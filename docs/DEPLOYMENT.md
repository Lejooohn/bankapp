# Deployment

BankApp runs as a Docker Compose stack on any Linux host (a home server, a NAS with Docker, a small VPS).
The stack is: PostgreSQL, the API (`backend`), the web app (`frontend`, served by nginx) and a backup sidecar.

## Requirements

- Docker Engine with the Compose plugin
- A folder for the project and a folder for backups, on a disk you back up
- Ideally a reverse proxy with TLS in front of the web port if you reach the app from outside your network

## Before the first start

1. Clone the repository and create `.env` from `.env.example`.
2. Set `POSTGRES_PASSWORD` and `ENCRYPTION_KEY` (see the README, *Configuration*).
   `ENCRYPTION_KEY` protects every backup and two-factor secret: store a copy outside the server.
3. Set `CORS_ORIGINS` to the exact URL you open in the browser.
4. Create the database volume and the network by hand, so that Compose never initialises an empty database by mistake:

   ```bash
   docker volume create bankapp-pgdata      # or the name you set in PGDATA_VOLUME
   docker network create bankapp-net         # or the name you set in NETWORK_NAME
   ```

## Start and update

```bash
docker compose up -d --build                 # first start and after each update
docker compose ps                            # all services should become healthy
```

To update: `git pull`, then run the same command again. Migrations run on start and are additive.

To roll back the code, check out the previous commit and run `docker compose up -d --build` again.

## Backups

- The `backup` service writes encrypted dumps to `BACKUP_DIR` (daily, weekly and monthly).
- `bash scripts/backup.sh` makes an extra encrypted dump on demand.
- `bash scripts/restore.sh` restores a dump. Read `docs/RESTORE_RUNBOOK.md` before using it.

No automated monitoring is included. Check the backup folder and `docker compose ps` yourself, and test a restore
from time to time.

## Synology NAS (example)

The stack runs on a Synology NAS with Container Manager, from a folder such as `/volume1/docker/bankapp`.
Run the commands above over SSH from that folder. The NAS does not need Node.js: the scripts run in the backend image.
