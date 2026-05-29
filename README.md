# Sync project

Monorepo with a NestJS backend, a React (Create React App) frontend, and a shared TypeScript package. MySQL is used via TypeORM.

---

## 1. Run with Docker

### Production-style stack (`docker-compose.yml`)

Builds production images: the API runs in Node on port **3001** inside the container; the UI is static files served by **nginx** on port **80** inside the container (mapped to the host below).

**Start**

```bash
docker compose up --build
```

**Default host ports**

| Service   | Host port | Container port | Notes |
|-----------|-----------|----------------|--------|
| Frontend  | **3000**  | 80             | nginx → React build |
| Backend   | **3001**  | 3001           | NestJS `PORT` (see `Dockerfile.backend`) |
| MySQL     | —         | —              | **Not included** in this file. Point the backend at your own MySQL (see below). |

**MySQL for this compose file**

`docker-compose.yml` does not start a database. Either:

- Run MySQL elsewhere and pass database settings into the `backend` service (add an `environment:` block with `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`), or  
- Use the dev compose file in the next section, which includes MySQL.

**Change ports (backend / frontend)**

Edit the `ports:` mappings in `docker-compose.yml`:

```yaml
backend:
  ports:
    - "3001:3001"   # left = host, right = container (must match app listen port)

frontend:
  ports:
    - "3000:80"     # left = host URL port; right = nginx (keep 80)
```

- To run the API on another **container** port (e.g. 4001), set `PORT` / `EXPOSE` in `Dockerfile.backend` and use `"HOST:4001"` on the left in compose.  
- The production **frontend** is built at image build time; `REACT_APP_*` values in `docker-compose.yml` apply to the **dev** workflow unless you add build args to `Dockerfile.frontend` and rebuild.

Backend data directory on the host: `./backend-data` → `/app/data` in the container.

---

### Full dev stack with MySQL (`docker-compose.dev.yml`)

Hot reload: source is mounted, MySQL included, CRA dev server for the UI.

**Start**

```bash
docker compose -f docker-compose.dev.yml up --build
```

**Default host ports**

| Service   | Host ports     | Container | Notes |
|-----------|----------------|-----------|--------|
| Frontend  | **3000**       | 3000      | CRA (`npm start`); open **http://localhost:3000** |
| Backend   | **3001**       | 3001      | `npm run start:dev` |
| MySQL     | **3306**       | 3306      | root password `rootpassword`, DB `hungviet_smarthome` |

**Change ports**

In `docker-compose.dev.yml`, adjust each service’s `ports:` line, for example:

```yaml
db:
  ports:
    - "3307:3306"   # host 3307 → MySQL still listens on 3306 inside the network

backend:
  ports:
    - "4001:4001"   # only if you also set PORT=4001 in environment
  environment:
    - PORT=4001
    - DB_HOST=db
    - DB_PORT=3306   # stays 3306 (container-to-container)
```

If MySQL’s **host** port changes, the backend **inside Docker** should still use `DB_HOST=db` and `DB_PORT=3306` (service name `db`). Only apps on your **machine** (local Node, not in compose) need `DB_PORT` equal to the published host port.

For the frontend dev server host port, set `PORT` in the `frontend` service `environment:` (Create React App), and match the left side of `ports:`.

`REACT_APP_API_URL` is set to `http://localhost:3001` so the **browser** can reach the API on the host. If you publish the backend on another host port, set `REACT_APP_API_URL` accordingly.

**Persistent MySQL data**

`./mysql-data` on the host is mounted into the database container.

---

## 2. Run on your machine (local)

Requirements: **Node.js** (project Dockerfiles use Node 23; LTS is fine in practice), **npm**, and **MySQL 8** reachable from your machine.

### MySQL

Start MySQL locally or with Docker, for example:

```bash
docker run -d --name sync-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=hungviet_smarthome \
  mysql:8.0 --default-authentication-plugin=mysql_native_password
```

**Port:** publish `3306` (or another host port). If you use another host port, set `DB_PORT` in the backend `.env` to that value and keep `DB_HOST=localhost`.

### Shared package

From the repository root:

```bash
npm install --prefix packages/shared
npm run build --prefix packages/shared
```

(The app `package.json` scripts also run shared build via `npm run build:shared` from root.)

### Backend (`apps/backend`)

```bash
cd apps/backend
npm install
```

Create `apps/backend/.env` (not committed) with at least:

| Variable       | Purpose |
|----------------|---------|
| `PORT`         | API listen port (default **3001**) |
| `DB_HOST`      | MySQL host (`localhost` if MySQL is on the same machine) |
| `DB_PORT`      | MySQL port (**3306** by default; match your server) |
| `DB_USERNAME`  | MySQL user |
| `DB_PASSWORD`  | MySQL password |
| `DB_DATABASE`  | Database name |

Optional: `APP_TIMEZONE`, `SYNC_CRON_EXPRESSION`, PushSale-related keys, etc. (see existing `.env` if you have one).

```bash
npm run start:dev
```

API: **http://localhost:3001** (or your `PORT`).

### Frontend (`apps/frontend`)

```bash
cd apps/frontend
npm install
```

Create `apps/frontend/.env`:

| Variable                 | Purpose |
|--------------------------|---------|
| `PORT`                   | CRA dev server port (default **3000**) |
| `REACT_APP_API_URL`      | Backend base URL (e.g. **http://localhost:3001**) |
| `REACT_APP_PANEL_PREFIX` | Admin route prefix (default in code: `x-panel-5661`) |
| `REACT_APP_AUTH_TOKEN_KEY` / `REACT_APP_AUTH_USER_KEY` | localStorage keys for auth |

```bash
npm start
```

App: **http://localhost:3000** (or your `PORT`).

**Summary: local ports**

| Component | Default port | How to change |
|-----------|--------------|----------------|
| MySQL     | 3306         | Server config / `docker run -p`; set `DB_PORT` (+ `DB_HOST`) in `apps/backend/.env` |
| Backend   | 3001         | `PORT` in `apps/backend/.env` |
| Frontend  | 3000         | `PORT` in `apps/frontend/.env`; set `REACT_APP_API_URL` to match backend URL |

---

## 3. Repository layout

```text
sync-project/
├── apps/
│   ├── backend/          # NestJS API (auth, users, products, orders, PushSale sync)
│   │   └── src/          # Modules, TypeORM entities, controllers, services
│   └── frontend/         # React (CRA) SPA + admin UI
│       └── src/          # Features, shared UI, API client, i18n
├── packages/
│   └── shared/           # Shared TypeScript (types/constants used by both apps)
├── docker-compose.yml    # Production-like: backend + frontend images (no MySQL)
├── docker-compose.dev.yml# Dev: backend + frontend + MySQL with bind mounts
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf             # SPA routing for the production frontend image
└── package.json           # Root scripts: build shared + apps
```

| Path | Role |
|------|------|
| `apps/backend` | REST API, JWT auth, scheduled sync, MySQL persistence via TypeORM. |
| `apps/frontend` | Public landing and authenticated admin (MUI, React Query, react-router). |
| `packages/shared` | Cross-app enums/types (e.g. sync-related) consumed as `file:` dependency. |
| Docker / nginx files | Container builds and reverse proxy for the static frontend in production. |

---

## 4. Production deploy on 1 VPS (no Docker)

Target: a single Ubuntu 22.04 / Debian 12 VPS hosting **MySQL + backend + frontend + nginx**, with the daily PushSale sync cron running reliably.

### 4.1 System prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx mysql-server logrotate
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo timedatectl set-ntp true                              # keep system clock accurate
```

Install Node.js **22.22.2** (matches `.nvmrc`). Easiest path is nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
. ~/.nvm/nvm.sh
nvm install 22.22.2 && nvm alias default 22.22.2
sudo ln -sf "$(which node)" /usr/local/bin/node
sudo ln -sf "$(which npm)"  /usr/local/bin/npm
```

### 4.2 MySQL setup

```bash
sudo mysql_secure_installation
sudo mysql <<'SQL'
CREATE DATABASE hungviet_smarthome CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sync_app'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON hungviet_smarthome.* TO 'sync_app'@'localhost';
FLUSH PRIVILEGES;
SQL
```

### 4.3 Code, dependencies, build

```bash
sudo mkdir -p /opt/sync-project && sudo chown $USER:$USER /opt/sync-project
git clone <your-repo-url> /opt/sync-project
cd /opt/sync-project

npm ci --prefix packages/shared
npm run build --prefix packages/shared

# Backend
cp apps/backend/.env.example apps/backend/.env
$EDITOR apps/backend/.env       # fill in real values (see "Required env" below)
npm ci --prefix apps/backend
npm run build --prefix apps/backend

# Frontend (REACT_APP_* are baked at build time → set before building)
cp apps/frontend/.env.example apps/frontend/.env
$EDITOR apps/frontend/.env      # set REACT_APP_API_URL to your public backend URL
npm ci --prefix apps/frontend
npm run build --prefix apps/frontend     # output: apps/frontend/build/
```

**Required env in `apps/backend/.env`:**

| Variable | Notes |
|---|---|
| `PORT` | API listen port, default `3001` |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` — cron + log rollover use this zone |
| `SYNC_CRON_EXPRESSION` | default `5 0 * * *` (00:05 in `APP_TIMEZONE`) |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | match section 4.2 |
| `DB_SYNCHRONIZE` | leave `true` on first boot to create tables, then set to `false` and restart |
| `JWT_SECRET` | **required** — `openssl rand -base64 48` |
| `CORS_ORIGIN` | e.g. `https://your-domain.com` (comma-separated for multiple) |
| `DEFAULT_USER_PASSWORD` | initial password for auto-created PushSale users |
| `PUSHSALE_CLIENT_ID` / `PUSHSALE_API_TOKEN` / `PUSHSALE_API_URL` | rotate these before production |
| `PUSHSALE_REQUEST_INTERVAL_MS` | `61000` is correct for the current PushSale throttle |
| `META_GRAPH_API_VERSION` / `META_APP_ID` / `META_BUSINESS_ID` / `META_ACCESS_TOKEN` | Facebook Ads sync |
| `ENABLE_LOG` | `true` to write `apps/backend/logs/YYYY-MM-DD.log` |

### 4.4 Backend service — systemd (this is what makes the cron reliable)

The cron lives **inside** the Nest process (`SyncService`). For it to fire every day, the process must always be running. systemd + `Restart=always` is the lightest way to guarantee that on a single VPS.

Create `/etc/systemd/system/sync-backend.service`:

```ini
[Unit]
Description=Sync Project — NestJS backend (with daily PushSale cron)
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/sync-project/apps/backend
Environment=NODE_ENV=production
Environment=TZ=Asia/Ho_Chi_Minh
EnvironmentFile=/opt/sync-project/apps/backend/.env
ExecStart=/usr/local/bin/node dist/main.js
Restart=always
RestartSec=5
# Keep stdout/stderr in journald in addition to logs/YYYY-MM-DD.log
StandardOutput=journal
StandardError=journal
# Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo chown -R www-data:www-data /opt/sync-project
sudo systemctl daemon-reload
sudo systemctl enable --now sync-backend
sudo systemctl status sync-backend
journalctl -u sync-backend -f
```

Expected log on first boot:

```
Daily PushSale sync cron registered: "5 0 * * *" (Asia/Ho_Chi_Minh).
Startup catch-up: ...
```

### 4.5 Cron reliability — how this project handles the failure modes

The backend now does the following automatically (see `apps/backend/src/sync/sync.service.ts`):

1. **Schedule** — `node-cron` job is registered in `onModuleInit` using `SYNC_CRON_EXPRESSION` in `APP_TIMEZONE`. systemd keeps the process up so the cron actually fires at 00:05 every day.
2. **Re-entrancy lock** — both the cron trigger and `POST /sync/orders` go through the same in-process lock. If a previous run is still in progress, a new request is logged and ignored (no overlapping PushSale calls, no double-write to `sync_logs`).
3. **Missed-run catch-up** — on every boot, the service checks whether yesterday (in `APP_TIMEZONE`) already has a successful `sync_logs` row. If not, it triggers the sync immediately. This recovers from "process was down at 00:05" without manual intervention. *Older* missed days still need to be re-synced manually:

   ```bash
   curl -X POST http://127.0.0.1:3001/sync/orders \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"date":"YYYY-MM-DD"}'
   ```

4. **Crash recovery** — `Restart=always` in the unit + the lock + the catch-up combine to give you "the cron will run today, even if the process bounced".

#### Verifying the cron end-to-end

Temporarily change the schedule and watch journalctl:

```bash
sudo sed -i 's/^SYNC_CRON_EXPRESSION=.*/SYNC_CRON_EXPRESSION="*\/2 * * * *"/' /opt/sync-project/apps/backend/.env
sudo systemctl restart sync-backend
journalctl -u sync-backend -f       # expect a run every 2 minutes
# Revert when done:
sudo sed -i 's/^SYNC_CRON_EXPRESSION=.*/SYNC_CRON_EXPRESSION="5 0 * * *"/' /opt/sync-project/apps/backend/.env
sudo systemctl restart sync-backend
```

Check the DB:

```sql
SELECT id, sync_date, trigger_source, status, synced_count, created_at
FROM sync_log
ORDER BY id DESC
LIMIT 10;
```

#### (Optional) external watchdog cron

If you want belt-and-suspenders alerting, add a host cron that pings the backend after the expected daily run:

```bash
# /etc/cron.d/sync-watchdog
30 0 * * * www-data curl -sf -X POST http://127.0.0.1:3001/sync/orders \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{}' >> /var/log/sync-watchdog.log 2>&1
```

Because of the in-process lock, this second call is a no-op when the 00:05 cron already ran successfully, and a free retry if it didn't.

### 4.6 nginx — serve the frontend + reverse-proxy the API

`/etc/nginx/sites-available/sync-project`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend: CRA build directory
    root /opt/sync-project/apps/frontend/build;
    index index.html;

    # SPA history fallback
    location / {
        try_files $uri /index.html;
    }

    # Backend (Nest) reverse proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;             # PushSale sync runs are long-lived
    }

    client_max_body_size 20m;                # uploads (xlsx etc.)
}
```

Activate + reload:

```bash
sudo ln -s /etc/nginx/sites-available/sync-project /etc/nginx/sites-enabled/sync-project
sudo nginx -t && sudo systemctl reload nginx
```

Then set `REACT_APP_API_URL=https://your-domain.com/api` in `apps/frontend/.env` and **rebuild** the frontend (`npm run build --prefix apps/frontend`). Set `CORS_ORIGIN=https://your-domain.com` in the backend `.env` and `sudo systemctl restart sync-backend`.

### 4.7 HTTPS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot edits the nginx config and installs a renewal timer automatically.

### 4.8 Log rotation

Backend writes one log file per day to `apps/backend/logs/YYYY-MM-DD.log` (no built-in rotation/pruning). Add `/etc/logrotate.d/sync-backend`:

```text
/opt/sync-project/apps/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su www-data www-data
}
```

### 4.9 Database backups

Daily mysqldump via host cron:

```bash
sudo mkdir -p /var/backups/mysql && sudo chown www-data:www-data /var/backups/mysql
sudo crontab -u www-data -e
# Add:
0 1 * * * mysqldump -u sync_app -p'STRONG_PASSWORD_HERE' hungviet_smarthome \
  | gzip > /var/backups/mysql/hungviet_smarthome-$(date +\%F).sql.gz
0 2 * * * find /var/backups/mysql -name '*.sql.gz' -mtime +14 -delete
```

### 4.10 Deploy updates

```bash
cd /opt/sync-project
git pull
npm ci --prefix packages/shared && npm run build --prefix packages/shared
npm ci --prefix apps/backend  && npm run build --prefix apps/backend
npm ci --prefix apps/frontend && npm run build --prefix apps/frontend
sudo systemctl restart sync-backend
sudo systemctl reload nginx
journalctl -u sync-backend -n 50 --no-pager
```

### 4.11 Production hardening checklist

- [ ] Rotated `JWT_SECRET`, `DEFAULT_USER_PASSWORD`, `PUSHSALE_API_TOKEN`, `META_ACCESS_TOKEN`.
- [ ] `apps/backend/.env` permissions: `chmod 600` + owned by `www-data`.
- [ ] `DB_SYNCHRONIZE=false` after the first successful boot (prevents accidental schema changes when entities are refactored).
- [ ] `CORS_ORIGIN` restricted to the real frontend origin.
- [ ] Firewall: `ufw allow 22,80,443/tcp` and `ufw deny 3306,3001` (backend reachable via nginx only).
- [ ] HTTPS via certbot on port 443.
- [ ] Logrotate active for `apps/backend/logs/`.
- [ ] mysqldump cron + retention configured.
- [ ] `systemctl is-enabled sync-backend nginx mysql` all return `enabled`.

---

# Recommend fix errors
1/ Command hang and cant complete
# This ensures no zombies from a previous run will starve the new one
pkill -9 -f eslint
pkill -9 -f jest
