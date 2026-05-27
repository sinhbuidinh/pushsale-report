# RELEASE — VPS deploy for `your-domain.com`

Step-by-step guide to release this monorepo (NestJS backend + CRA frontend + MySQL) onto a single Ubuntu VPS, with the frontend served at **https://your-domain.com** and CORS configured so that the SPA can call the backend.

The full reference (with explanations of every option) lives in `README.md` §4. This file is the **shortest reliable path** from a fresh VPS to a working release.

---

## 0. Architecture chosen here

```
                  ┌────────────────────────────────────────┐
Browser ──HTTPS──▶│ nginx on the VPS (ports 80/443)        │
                  │  ├── /          → CRA build (static)   │
                  │  └── /api/*     → 127.0.0.1:3001 (API) │
                  └────────────────────────────────────────┘
                           │
                           ▼
                   NestJS (systemd: sync-backend) ──▶ MySQL (localhost:3306)
```

- The frontend is served as **static files** from `apps/frontend/build/`.
- The backend listens on `127.0.0.1:3001` only and is reverse-proxied by nginx under `/api/`.
- We still **enable CORS** so that:
  - the SPA keeps working if you ever expose the API on a separate origin (e.g. `api.your-domain.com`); and
  - a developer can run the CRA dev server on `http://localhost:3000` against this prod backend if needed.

DNS prerequisite (do this first, before §6 HTTPS):

| Record                              | Type | Value           |
|-------------------------------------|------|-----------------|
| `your-domain.com`                   | A    | `<VPS public IP>` |
| `www.your-domain.com`               | A    | `<VPS public IP>` |

---

## 0.1 VPS sizing & runtime preconditions

This monorepo (NestJS + MySQL + nginx + CRA build) is designed to run on **one** VPS. Pick the cheapest size that still hits the floors below — going under causes silent failures (`react-scripts build` killed by OOM, `mysqld` killed mid-cron) that are confusing to debug after the fact.

### Sizing matrix

| Profile | vCPU | RAM | SSD (NVMe preferred) | Headroom for | When to pick |
|---|---|---|---|---|---|
| **Minimum** | 1 | 2 GB | 40 GB | runtime only — build the FE on your laptop and `rsync apps/frontend/build/` to the VPS | personal/dev, <5 users, tolerant of swap thrashing |
| **Recommended (≤10 users)** | 2 | 4 GB | 60 GB | runtime + `react-scripts build` on the VPS + 14-day mysqldump retention | **the default for this project** |
| **Future-proof (20–30 users)** | 2–4 | 8 GB | 80 GB | runtime + Docker + Redis/queues if added later | growth without re-provisioning for 1–2 years |

### Why RAM matters more than vCPU

| Process | Resident RAM | Notes |
|---|---|---|
| nginx | ~30 MB | static SPA + reverse proxy |
| NestJS / Node 22 (`sync-backend`) | 250–500 MB | one process; the sync cron is I/O-bound (PushSale throttle = 61 s/page) |
| MySQL 8 with `innodb_buffer_pool_size=1G` | ~1.5 GB | dominant consumer; the default 128 M is too small once the marketing-summary aggregations run |
| OS + journald + sshd + cron | ~250 MB | baseline |
| **Runtime total** | **~2 GB** | what the box uses with nobody logged in |
| `react-scripts build` peak | **+1.5–2 GB** | only at deploy time, but this is the spike that forces 4 GB on a "10 user" box |

Net: **2 GB RAM is the runtime floor; 4 GB is the build-on-the-server floor.** If you must run a 2 GB plan, build the frontend on your laptop and copy `apps/frontend/build/` over — and configure swap (below) so an unrelated spike doesn't trigger the OOM killer.

### Why 2 vCPU is enough (and 4+ is wasted)

- Node is single-threaded; one fast vCPU handles 10 concurrent admin users with room to spare.
- The second vCPU absorbs MySQL + nginx during user requests and the daily PushSale cron at 00:05 (which competes with backups and logrotate).
- 4+ cores is wasted at this scale — Node won't use them, the MySQL workload on this dataset won't either.

### Why NVMe (or "fast SSD") is non-negotiable

It's not about throughput, it's about latency: `apps/backend/src/sync/sync.service.ts → processOrder` does **row-by-row TypeORM inserts**. Each order is several round-trips to disk. On HDD or shared SAS a 3-minute sync turns into 15+ minutes, and the per-page PushSale throttle hides the slowdown until backlogs build up.

Disk budget on a 60 GB SSD:

- Ubuntu + system: ~10 GB
- `node_modules` ×3 (shared + backend + frontend) + dist + build: ~3 GB
- MySQL data dir (`app_database`): starts <100 MB, grows ~1–5 GB / year depending on order volume
- `/var/backups/mysql` (14-day gzipped dumps): ~1–3 GB steady state
- `apps/backend/logs/` + journald: ~1 GB

→ Comfortable headroom for 2–3 years.

### Swap — mandatory on 2 GB plans, recommended on 4 GB

Without swap, an unexpected memory spike (CRA build colliding with the cron, a bcrypt burst at login, an `xlsx` export of a large dataset) triggers the Linux OOM killer, which **picks the process holding the most RAM — almost always `mysqld` or the Nest service.** The result is a hard crash with no useful log line in the app.

Add 2 GB of swap **before** the first deploy:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make it survive reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Prefer real RAM; only swap when there's genuine pressure
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl vm.swappiness=10
```

Verify:

```bash
free -h                       # → a "Swap:" row showing 2.0Gi
swapon --show                 # → /swapfile  file  2G ...
cat /proc/sys/vm/swappiness   # → 10
```

If `vmstat 5` shows non-zero `si` / `so` columns during normal use, you've **outgrown the plan** — upgrade RAM, do not enlarge swap. Swap is a safety net for spikes, not a substitute for memory.

---

## 1. Provision the VPS

Ubuntu 22.04 / Debian 12, root or a sudo user.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx mysql-server logrotate ufw
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo timedatectl set-ntp true
```

Install Node.js **22.22.2** (project pins it via `.nvmrc` / `engines`):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
. ~/.nvm/nvm.sh
nvm install 22.22.2 && nvm alias default 22.22.2
sudo ln -sf "$(which node)" /usr/local/bin/node
sudo ln -sf "$(which npm)"  /usr/local/bin/npm
node -v   # → v22.22.2
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw deny 3001/tcp     # backend reachable only via nginx
sudo ufw deny 3306/tcp     # MySQL reachable only via localhost
sudo ufw enable
```

> Need MySQL Workbench / DBeaver / TablePlus access from your laptop? Keep `3306` denied here and use the **SSH tunnel** in §2.1 (recommended). If you really need to expose the port, §2.1 also covers the IP-restricted and (discouraged) public options.

---

## 2. Database

```bash
sudo mysql_secure_installation
sudo mysql <<'SQL'
CREATE DATABASE app_database
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'app_user'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON app_database.* TO 'app_user'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Keep the password in a password manager — it goes into `apps/backend/.env` in §3.

### MySQL config tuning for a 4 GB RAM VPS

Ubuntu's MySQL 8 defaults assume <1 GB RAM and leave most of the box on the table. Drop a tuning file in `mysql.conf.d/` (instead of editing the main config so future package upgrades don't clobber it). The `zz-` prefix makes MySQL load it last, so it overrides earlier defaults.

`/etc/mysql/mysql.conf.d/zz-sync-project.cnf`:

```ini
[mysqld]
# --- InnoDB buffer pool: the single biggest knob ---
# Rule of thumb: ~25% of physical RAM on a 4 GB VPS where MySQL shares the
# box with Node + nginx. Holds hot rows + indexes in memory; the marketing-
# summary aggregations are the main beneficiary because they scan order /
# order_detail tables.
innodb_buffer_pool_size = 1G

# Redo log sized to match the buffer pool — bigger logs = fewer fsyncs under
# write bursts (daily PushSale cron writes hundreds of orders in minutes).
innodb_log_file_size = 256M

# 1 = strict per-transaction fsync. 2 trades a 1-second crash window for
# ~2–3x write throughput, which is the right call here: PushSale is the
# source of truth, a re-sync recovers any lost tail.
innodb_flush_log_at_trx_commit = 2

# Connection ceiling: 10 users × a few queries + tooling + cron = plenty.
max_connections = 50

# Temp / heap table size — helps marketing-summary GROUP BYs stay in RAM
# instead of spilling to /tmp.
tmp_table_size = 64M
max_heap_table_size = 64M
table_open_cache = 1000

# UTF8MB4 is already the schema default; pin it server-wide so any future
# tool that connects without specifying charset doesn't fall back to latin1.
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

Apply and verify:

```bash
sudo systemctl restart mysql
mysql -u app_user -p -e "SHOW VARIABLES WHERE Variable_name IN ( \
  'innodb_buffer_pool_size','innodb_log_file_size','max_connections', \
  'tmp_table_size','character_set_server');"
```

Values come back in bytes — `innodb_buffer_pool_size = 1073741824` is the correct 1 G.

Memory check after `mysqld` has been up for a minute or two:

```bash
free -h
# At idle on a 4 GB box, "used" should sit around 2.0–2.5 GiB with mysqld the
# largest consumer (~1.5 GiB RSS). 'available' staying above ~1.5 GiB is the
# indicator that there's enough headroom to run `react-scripts build` (§4).
```

**On a 2 GB plan** (Minimum profile in §0.1) halve everything — `innodb_buffer_pool_size = 384M`, `innodb_log_file_size = 96M`, `tmp_table_size = 32M`. Do not push MySQL above ~25% of total RAM when it shares the box with Node + nginx; the build will OOM long before the DB benefits.

---

## 2.1 Connect from MySQL Workbench / DBeaver / TablePlus

You have three options. Pick **one**. Option A is the right answer for almost everyone.

### Option A — SSH tunnel (recommended)

No firewall change, no MySQL config change, no extra DB user. The desktop tool opens an SSH connection to the VPS and forwards `localhost:3306` on your laptop to `localhost:3306` on the VPS. From MySQL's point of view the connection is still local.

#### A.0 — Set up the SSH key (one-time)

> Important: the SSH **keypair is generated on your laptop, not on the VPS**. The laptop keeps the *private* key (`id_ed25519`); the VPS only gets the *public* key (`id_ed25519.pub`) appended to `~/.ssh/authorized_keys` for the user you'll log in as. Generating a key on the VPS and downloading it is the wrong direction and weakens the model.
>
> If you can already run `ssh user@<VPS public IP>` and land in a shell **without typing a password**, skip this whole subsection — you're done.

**1. On your laptop — create the keypair (skip if `~/.ssh/id_ed25519` already exists):**

```bash
# macOS / Linux / Windows (Git Bash, WSL, or PowerShell with OpenSSH):
ssh-keygen -t ed25519 -C "workbench@$(hostname)" -f ~/.ssh/id_ed25519
# Press Enter for default location. Set a passphrase OR leave empty.
# (Empty = convenient. Passphrase + ssh-agent = same convenience + safer if the laptop is lost.)
```

This produces two files:

| File | Lives on | Goes in Workbench's "SSH Key File" field? |
|---|---|---|
| `~/.ssh/id_ed25519`     | **laptop only** — never copy this to the VPS | **yes — this one** |
| `~/.ssh/id_ed25519.pub` | laptop, then copied to VPS `authorized_keys` | no |

**2. Copy the *public* key to the VPS** (still running on your laptop). The cleanest tool is `ssh-copy-id`; it appends to the right file with the right permissions:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@<VPS public IP>
# user = the sudo user you created on the VPS (e.g. ubuntu, debian, your-name)
# This is the one and only time you'll type the user's password.
```

If `ssh-copy-id` isn't available (older Windows boxes), do it manually:

```bash
# laptop
cat ~/.ssh/id_ed25519.pub
# select + copy the single line of output, then on the VPS:
ssh user@<VPS public IP>      # password login this once
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'PASTE-THE-PUBLIC-KEY-LINE-HERE' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
exit
```

**3. Verify the key works** (laptop):

```bash
ssh -i ~/.ssh/id_ed25519 user@<VPS public IP> 'echo ok && whoami'
# → ok
# → user
```

If that prints `ok` without a password prompt, Workbench will work too. Common gotchas if it doesn't:

- `~/.ssh` on the VPS must be `chmod 700`, `~/.ssh/authorized_keys` must be `chmod 600`, both owned by `user`. Wrong perms → sshd silently ignores the file. Fix:
  ```bash
  ssh user@<VPS public IP>
  chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && ls -la ~/.ssh
  ```
- Make sure you copied the `.pub` file, not the private one. (`ssh-keygen -y -f ~/.ssh/id_ed25519` will re-print the public half if you ever lose track.)
- Run `ssh -v user@<VPS public IP>` to see exactly which key sshd is offering / accepting.

**4. (Optional but recommended) — turn off password login** once key auth works, so brute-force attempts on port 22 stop mattering. On the **VPS**:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/'    /etc/ssh/sshd_config
sudo sshd -t                       # config syntax check — must print nothing
sudo systemctl reload ssh          # ('ssh' on Ubuntu, 'sshd' on some distros)
```

Do this from a session you already have open via key auth, and keep a second terminal logged in until you've verified a fresh key login still works — that way a typo can't lock you out.

#### A.1 — Configure the desktop tool

**MySQL Workbench** (`Database → Manage Connections → New`):

| Field | Value |
|---|---|
| Connection Method | **Standard TCP/IP over SSH** |
| SSH Hostname | `<VPS public IP>:22` |
| SSH Username | your sudo user on the VPS (e.g. `ubuntu`) |
| SSH Key File | path to your `~/.ssh/id_ed25519` (or `id_rsa`) |
| MySQL Hostname | `127.0.0.1` |
| MySQL Server Port | `3306` |
| Username | `app_user` |
| Password | the one from §2 |

**DBeaver / TablePlus**: enable "SSH Tunnel" / "Use SSH" on the connection and fill in the SSH host + private key the same way; the DB host stays `127.0.0.1`.

**CLI equivalent** (handy for quick checks or scripting `mysqldump`):

```bash
ssh -L 3307:127.0.0.1:3306 user@<VPS public IP>
# in another terminal on your laptop:
mysql -h 127.0.0.1 -P 3307 -u app_user -p app_database
```

The chosen `'app_user'@'localhost'` user from §2 already works because, over the tunnel, MySQL sees the connection as coming from `localhost` on the VPS.

### Option B — Open port 3306 to a fixed IP only

Use this only if a tunnel really won't work (e.g. an analytics box that needs persistent access). Three things must change together:

1. Make MySQL listen on the public interface. Edit `/etc/mysql/mysql.conf.d/mysqld.cnf`, change

   ```ini
   bind-address = 127.0.0.1
   ```

   to

   ```ini
   bind-address = 0.0.0.0
   ```

   then `sudo systemctl restart mysql`.

2. Create a remote user (the existing `'app_user'@'localhost'` only works locally). Substitute your real public IP — get it from `https://ifconfig.me`:

   ```sql
   CREATE USER 'app_user'@'YOUR.PUBLIC.IP.HERE'
     IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
   GRANT ALL PRIVILEGES ON app_database.*
     TO 'app_user'@'YOUR.PUBLIC.IP.HERE';
   FLUSH PRIVILEGES;
   ```

   Or, for read-only browsing, prefer a separate scoped account:

   ```sql
   CREATE USER 'reader'@'YOUR.PUBLIC.IP.HERE'
     IDENTIFIED BY 'ANOTHER_STRONG_PASSWORD';
   GRANT SELECT ON app_database.* TO 'reader'@'YOUR.PUBLIC.IP.HERE';
   FLUSH PRIVILEGES;
   ```

3. Open the firewall **only** for that IP (do **not** replace the blanket `deny 3306/tcp` with `allow 3306/tcp`):

   ```bash
   sudo ufw allow from YOUR.PUBLIC.IP.HERE to any port 3306 proto tcp
   sudo ufw status numbered          # confirm the new rule is above the deny
   ```

   `ufw` evaluates rules top-to-bottom, and `allow from <ip>` is more specific than the blanket `deny 3306/tcp`, so the allow wins for that IP.

In Workbench use `Standard (TCP/IP)`, hostname = `<VPS public IP>`, port = `3306`, username = `app_user` (or `reader`).

If your home/office IP is dynamic, either re-run step 3 each time it changes, or use a Dynamic DNS hostname plus a tiny cron that updates the ufw rule — but at that point Option A is just easier.

### Option C — Open port 3306 to the internet (NOT recommended)

Only do this if the database is genuinely meant to be public. You still need `bind-address = 0.0.0.0` (Option B step 1), a `'app_user'@'%'` user, and:

```bash
sudo ufw delete deny 3306/tcp     # remove the deny first
sudo ufw allow 3306/tcp
```

If you go this route, **at minimum**:

- Use a long random password (`openssl rand -base64 24`).
- Create a separate per-tool user with the **smallest** privilege set you can (`SELECT` only for read tools).
- Watch `/var/log/mysql/error.log` for brute-force attempts and consider `fail2ban` with the MySQL filter.
- Re-evaluate weekly whether you actually still need this — and revert to Option A as soon as you can.

### Reverting

To go back to "MySQL is private":

```bash
# 1. Re-bind to localhost
sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql

# 2. Drop any remote users you created
sudo mysql -e "DROP USER 'app_user'@'YOUR.PUBLIC.IP.HERE';"      # adjust as needed
sudo mysql -e "DROP USER 'app_user'@'%';"                        # if you used Option C

# 3. Restore the firewall
sudo ufw delete allow 3306/tcp 2>/dev/null
sudo ufw delete allow from YOUR.PUBLIC.IP.HERE to any port 3306 proto tcp 2>/dev/null
sudo ufw deny 3306/tcp
sudo ufw status
```

Add to the §8 hardening checklist if you used Option B/C: "MySQL `bind-address` is back to `127.0.0.1` and `ufw` denies 3306 once remote access is no longer needed."

---

## 3. Pull the code & configure env

```bash
sudo mkdir -p /opt/sync-project && sudo chown $USER:$USER /opt/sync-project
git clone <your-repo-url> /opt/sync-project
cd /opt/sync-project
```

### 3.1 Backend `.env`

```bash
cp apps/backend/.env.example apps/backend/.env
chmod 600 apps/backend/.env
$EDITOR apps/backend/.env
```

Set at least these values. **`CORS_ORIGIN` is the key line for letting the FE on `https://your-domain.com` call the BE.**

```dotenv
PORT=3001
HOST=127.0.0.1                 # bind to loopback only; nginx fronts the public traffic
APP_TIMEZONE=Asia/Ho_Chi_Minh
ENABLE_LOG=true

SYNC_CRON_EXPRESSION="5 0 * * *"
PUSHSALE_REQUEST_INTERVAL_MS=61000

DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=app_user
DB_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
DB_DATABASE=app_database
DB_SYNCHRONIZE=true            # leave true for the FIRST boot, then flip to false (see §7)

JWT_SECRET=REPLACE_WITH_$(openssl rand -base64 48)
DEFAULT_USER_PASSWORD=ChangeMe123!

# CORS — comma-separated whitelist. main.ts feeds this directly into NestJS enableCors().
# The browser must see its current origin in this list (scheme + host, no path, no trailing slash).
CORS_ORIGIN=https://your-domain.com,https://www.your-domain.com

PUSHSALE_CLIENT_ID=...
PUSHSALE_API_TOKEN=...
PUSHSALE_API_URL=https://pushsale.vn/v1/getdata

META_GRAPH_API_VERSION=v25.0
META_APP_ID=...
META_BUSINESS_ID=...
META_ACCESS_TOKEN=...
```

> CORS reference: `apps/backend/src/main.ts` parses `CORS_ORIGIN` as:
>
> - empty / unset / `*` → allow all (do **not** use in prod)
> - comma-separated list → strict whitelist with `credentials: true`
>
> So as long as the SPA is loaded from `https://your-domain.com`, the browser sends `Origin: https://your-domain.com` and Nest replies with `Access-Control-Allow-Origin: https://your-domain.com` + `Access-Control-Allow-Credentials: true`. No code changes required to the backend.

### 3.2 Frontend `.env`

`REACT_APP_*` is **baked into the bundle at build time** — set this before `npm run build`.

```bash
cp apps/frontend/.env.example apps/frontend/.env
$EDITOR apps/frontend/.env
```

```dotenv
PORT=3000
# Same-origin path: nginx proxies /api/ → 127.0.0.1:3001
# This avoids cross-origin requests entirely from the browser's point of view,
# which is the most reliable setup. CORS in §3.1 still works as a safety net.
REACT_APP_API_URL=https://your-domain.com/api

REACT_APP_PANEL_PREFIX=...
REACT_APP_AUTH_TOKEN_KEY=...
REACT_APP_AUTH_USER_KEY=...
```

> Alternative: if you ever serve the API from a dedicated subdomain like `https://api.your-domain.com`, set `REACT_APP_API_URL=https://api.your-domain.com` and add that origin to nginx as a separate `server { }` block. The CORS whitelist in §3.1 already covers the SPA origin, no extra change needed there.

---

## 4. Build

```bash
cd /opt/sync-project

npm ci --prefix packages/shared
npm run build --prefix packages/shared

npm ci --prefix apps/backend
npm run build --prefix apps/backend       # → apps/backend/dist/

npm ci --prefix apps/frontend
npm run build --prefix apps/frontend      # → apps/frontend/build/
```

Hand the runtime user (`www-data`) ownership so systemd + nginx can read everything:

```bash
sudo chown -R www-data:www-data /opt/sync-project
```

---

## 5. Run the backend as a systemd service

`/etc/systemd/system/sync-backend.service`:

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
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sync-backend
sudo systemctl status sync-backend
journalctl -u sync-backend -f --since "1 min ago"
```

Cron registration check (must include both jobs):

```bash
journalctl -u sync-backend --since "5 min ago" --no-pager | rg -n "Daily PushSale sync cron registered|Daily Facebook Ads sync cron registered"
```

You should see both lines:

```
Daily PushSale sync cron registered: "5 0 * * *" (Asia/Ho_Chi_Minh).
Daily Facebook Ads sync cron registered: "15 0 * * *" (Asia/Ho_Chi_Minh).
```

Local smoke test (still on the VPS):

```bash
curl -i http://127.0.0.1:3001/health || curl -i http://127.0.0.1:3001/
```

---

## 6. nginx + HTTPS

`/etc/nginx/sites-available/your-domain.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Static SPA build
    root /opt/sync-project/apps/frontend/build;
    index index.html;
    client_max_body_size 20m;

    # SPA history fallback
    location / {
        try_files $uri /index.html;
    }

    # Reverse-proxy the API
    location /api/ {
        proxy_pass         http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;     # PushSale sync runs are long-lived
    }

    # Long-cache hashed assets, never cache index.html
    location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Activate, test, reload, then enable HTTPS:

```bash
sudo ln -sf /etc/nginx/sites-available/your-domain.com \
            /etc/nginx/sites-enabled/your-domain.com
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d your-domain.com -d www.your-domain.com \
  --redirect --agree-tos -m admin@your-domain.com
```

certbot rewrites the server block to listen on 443 and installs a renewal timer. After this:

- https://your-domain.com/ → SPA
- https://your-domain.com/api/auth/login (or whatever route) → NestJS

---

## 7. Verify CORS end-to-end

Run this **from your laptop**, not the VPS, so we exercise the real public path. The header pattern below is what the browser would send for a preflight from the SPA:

```bash
# Preflight (OPTIONS) — must return 204 + the right ACAO/ACAC headers
curl -i -X OPTIONS https://your-domain.com/api/auth/login \
  -H "Origin: https://your-domain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, authorization"
```

Expected (lines you must see):

```
HTTP/2 204
access-control-allow-origin: https://your-domain.com
access-control-allow-credentials: true
access-control-allow-methods: ...
access-control-allow-headers: content-type,authorization
vary: Origin
```

Then a forbidden origin must **not** receive ACAO:

```bash
curl -i -X OPTIONS https://your-domain.com/api/auth/login \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST"
# → no access-control-allow-origin header in the response
```

Finally, in the browser at https://your-domain.com, open DevTools → Network and confirm:
- requests go to `https://your-domain.com/api/...`,
- there are no `CORS error` / `blocked by CORS policy` messages,
- login + dashboard work.

If something is wrong:
- 502 Bad Gateway → backend not running (`systemctl status sync-backend`, `journalctl -u sync-backend -e`).
- CORS error → `CORS_ORIGIN` in `apps/backend/.env` doesn't match the browser's `Origin` exactly (scheme, host, no trailing slash). Fix and `sudo systemctl restart sync-backend`.
- 404 from `/api/...` → the SPA's `REACT_APP_API_URL` is wrong; rebuild the FE (§4) and reload nginx.

---

## 8. Lock the schema, lock the secrets

After the first successful boot the DB schema exists, so disable auto-sync:

```bash
sudo sed -i 's/^DB_SYNCHRONIZE=.*/DB_SYNCHRONIZE=false/' /opt/sync-project/apps/backend/.env
sudo systemctl restart sync-backend
```

Hardening checklist (mirrors `README.md` §4.11):

- [ ] `JWT_SECRET`, `DEFAULT_USER_PASSWORD`, `PUSHSALE_API_TOKEN`, `META_ACCESS_TOKEN` rotated to production values.
- [ ] `apps/backend/.env` is `chmod 600` and owned by `www-data`.
- [ ] `DB_SYNCHRONIZE=false`.
- [ ] `CORS_ORIGIN` lists only `https://your-domain.com,https://www.your-domain.com` (drop `http://localhost:3000` if not needed).
- [ ] `ufw status` shows only 22/80/443 open. (If §2.1 Option B is in use, the 3306 rule is `ALLOW FROM <fixed-ip>` only — never a blanket allow.)
- [ ] MySQL `bind-address` is `127.0.0.1` unless §2.1 Option B/C is intentionally in use.
- [ ] MySQL tuning file `/etc/mysql/mysql.conf.d/zz-sync-project.cnf` is in place and `SHOW VARIABLES` reports the §2 values (in particular `innodb_buffer_pool_size`).
- [ ] Swap is active and `vm.swappiness=10` (`free -h` + `cat /proc/sys/vm/swappiness`), per §0.1.
- [ ] `systemctl is-enabled sync-backend nginx mysql` all return `enabled`.
- [ ] HTTPS is working (`curl -I https://your-domain.com`).
- [ ] `certbot renew --dry-run` succeeds.


---

## 9. Operations

### 9.1 Logs

- systemd / app stdout: `journalctl -u sync-backend -f`
- daily file logs: `/opt/sync-project/apps/backend/logs/YYYY-MM-DD.log`
- nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`

Add log rotation for the backend file logs (`/etc/logrotate.d/sync-backend`):

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

### 9.2 Database backups

```bash
sudo mkdir -p /var/backups/mysql && sudo chown www-data:www-data /var/backups/mysql
sudo crontab -u www-data -e
# Add:
0 1 * * * mysqldump -u app_user -p'REPLACE_WITH_STRONG_PASSWORD' app_database \
  | gzip > /var/backups/mysql/app_database-$(date +\%F).sql.gz
0 2 * * * find /var/backups/mysql -name '*.sql.gz' -mtime +14 -delete
```

### 9.3 Verifying the daily PushSale cron

```bash
journalctl -u sync-backend --since "today" | grep -i sync
mysql -u app_user -p app_database -e \
  "SELECT id, sync_date, trigger_source, status, synced_count, created_at \
   FROM sync_log ORDER BY id DESC LIMIT 5;"
```

The service auto-recovers a missed run on boot (see `apps/backend/src/sync/sync.service.ts` and `README.md` §4.5).

---

## 10. Releasing a new version

```bash
cd /opt/sync-project
git pull

# rebuild the bits that changed (safe to always run all three)
npm ci --prefix packages/shared  && npm run build --prefix packages/shared
npm ci --prefix apps/backend     && npm run build --prefix apps/backend
npm ci --prefix apps/frontend    && npm run build --prefix apps/frontend

sudo chown -R www-data:www-data /opt/sync-project
sudo systemctl restart sync-backend
sudo systemctl reload nginx

journalctl -u sync-backend -n 80 --no-pager
curl -I https://your-domain.com
```

Rollback: `git checkout <previous-tag>` and re-run §4 + the systemctl restart/reload. Keep one or two known-good tags.

---

## 11. Troubleshooting quick reference

| Symptom | First thing to check |
|---|---|
| Site loads but every API call fails with `CORS error` | `CORS_ORIGIN` in `apps/backend/.env` matches the **exact** SPA origin; restart `sync-backend`. |
| API call returns 502 | `systemctl status sync-backend`; `journalctl -u sync-backend -e`. |
| API call returns 404 from nginx | SPA built with wrong `REACT_APP_API_URL`; rebuild FE (§4). |
| Login works once, breaks on refresh | `REACT_APP_AUTH_TOKEN_KEY` mismatch between `.env` used at build time and what the running app expects. |
| Cron didn't fire | `journalctl -u sync-backend --since "yesterday"`; check `sync_log` table; service auto-catches up on next restart. |
| `DB_SYNCHRONIZE` ALTERed a column you didn't expect | Set `DB_SYNCHRONIZE=false` and write a real migration; restart. |
| Cert renewal fails | `sudo certbot renew --dry-run`, check that 80/443 are open in `ufw`. |
| Workbench can't connect (timeout) | Using §2.1 Option A: SSH actually works (`ssh user@vps`)? Using Option B: `ufw status` shows the per-IP allow above the deny, MySQL is bound to `0.0.0.0`, your current public IP still matches. |
| Workbench connects but auth fails | The user is `'app_user'@'localhost'` (Option A) or `'app_user'@'<your-ip>'` / `'%'` (Option B/C) — `'localhost'` users are rejected over a non-tunneled TCP connection. |
