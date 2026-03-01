# Backend (MVP)

Node.js backend for the gallery MVP with:

- Fastify API
- Supabase-backed persistence (boards, X connections, sync state)
- X OAuth 2.0 (PKCE code exchange)
- Manual like sync ingestion into board items/media
- In-memory fallback + mock modes for local debugging

## What is implemented

- Fastify server with CORS
- Health endpoints (`/health`, `/api/health`)
- Board endpoints (`/api/boards`, one moodboard per user)
- X connect/sync routes (`/api/x/connect/start`, `/api/x/connect/callback`, `/api/x/sync/run`)
- Supabase-backed store (`profiles`, `admin_users`, `boards`, `board_items`, `board_item_media`, X tables)
- Account routes (`/api/account/login`, `/api/account/admin/bootstrap`, `/api/account/me`, `/api/account`)
- In-memory store fallback with seed board/items for frontend integration work
- Supabase token validation hook (optional if keys are configured)
- Mock auth mode via header (enabled by default)
- Mock X OAuth mode via env flag (enabled by default)

## Quick start

1. Copy `backend/.env.example` to `backend/.env` and fill what you have now.
2. In Supabase SQL Editor, run `backend/supabase/schema.sql`.
3. Install dependencies:

```bash
cd backend
npm install
```

4. Start the backend:

```bash
npm run dev
```

5. Test health:

```bash
curl http://localhost:8787/api/health
```

## Docker deploy (frontend + backend)

1. Copy `backend/.env.example` to `backend/.env` and set real values.
2. In Supabase SQL Editor, run `backend/supabase/schema.sql`.
3. From repo root, build and run:

```bash
docker compose up -d --build
```

4. Open frontend at:

```text
http://localhost:8080
```

5. Backend API is also available directly at:

```text
http://localhost:8787
```

## Mock auth (for MVP route testing)

Protected routes accept a mock user header while `ENABLE_MOCK_AUTH=true`:

- Header name defaults to `x-demo-user-id`
- Example: `x-demo-user-id: alice`

Example (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8787/api/boards `
  -Headers @{ "x-demo-user-id" = "alice" } `
  -ContentType "application/json" `
  -Body '{"title":"Alice board","isPublic":true}'
```

## Live X + Supabase setup notes

- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Set `ENCRYPTION_KEY` (required for storing X tokens)
- Set `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI`
- Disable mock X mode for real OAuth:
  - `X_ENABLE_MOCK_OAUTH=false`

Example local X callback value (matches the backend route):

- `X_REDIRECT_URI=http://127.0.0.1:8787/api/x/connect/callback`

## Quick live X flow (MVP)

1. Start backend
2. Call `POST /api/x/connect/start` with mock auth header (or Supabase bearer token)
3. Open the returned `authorizationUrl`
4. Approve in X
5. X redirects to `/api/x/connect/callback` and backend stores encrypted tokens in Supabase
6. Call `POST /api/x/sync/run` to import image posts from likes into your default board

## Admin bootstrap

1. Sign in using `POST /api/account/login` (email + password from Supabase Auth).
2. Call `POST /api/account/admin/bootstrap` with your bearer token.
3. The first caller becomes the admin user and is stored in `admin_users`.

## Remaining next steps

- Add background sync worker for likes ingestion
- Wire frontend data loading to `/api/boards/:boardId/items`
- Add refresh-token retry logic in a worker path (route has basic refresh handling already)
- Add RLS / production auth hardening
