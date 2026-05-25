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

# Recommend fix errors
1/ Command hang and cant complete
# This ensures no zombies from a previous run will starve the new one
pkill -9 -f eslint
pkill -9 -f jest
