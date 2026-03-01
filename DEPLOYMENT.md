# Docker Deployment

This repo includes a two-container Docker setup:

- `backend` (Node/Fastify on port `8787`)
- `frontend` (Nginx serving Vite build on port `8080`, proxying `/api/*` to backend)

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

## 1) Configure backend env

Copy and edit:

```bash
cp backend/.env.example backend/.env
```

Important fields to set in `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI`

For Docker + Nginx proxy, a common local callback is:

```env
X_REDIRECT_URI=http://localhost:8080/api/x/connect/callback
FRONTEND_URL=http://localhost:8080
```

## 2) Apply database schema

Run `backend/supabase/schema.sql` in Supabase SQL editor.

## 3) Build and run

From repo root:

```bash
docker compose up -d --build
```

## 4) Access

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:8787`

## 5) Stop

```bash
docker compose down
```
