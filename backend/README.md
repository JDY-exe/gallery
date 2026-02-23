# Backend (MVP Scaffold)

Initial Node.js backend scaffold for the gallery MVP.

## What is implemented

- Fastify server with CORS
- Health endpoints (`/health`, `/api/health`)
- Board endpoints (`/api/boards`, CRUD for boards)
- X connect/sync route stubs (`/api/x/connect/start`, `/api/x/connect/callback`, `/api/x/sync/run`)
- Account delete stub (`/api/account`)
- In-memory store with seed board/items for frontend integration work
- Supabase token validation hook (optional if keys are configured)
- Mock auth mode via header (enabled by default)

## Quick start

1. Copy the repo root `.env.example` to `.env` and fill what you have now.
2. Install dependencies:

```bash
cd backend
npm install
```

3. Start the backend:

```bash
npm run dev
```

4. Test health:

```bash
curl http://localhost:8787/api/health
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

## Next implementation steps

- Replace in-memory store with Supabase/Postgres tables
- Implement X OAuth token exchange in callback route
- Add background sync worker for bookmarks ingestion
- Wire frontend data loading to `/api/boards/:boardId/items`
