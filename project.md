## Purpose of project

Integrate twitter (X) with a pinterest-like aggregation platform for collecting art inspiration/moodboarding. When the user does some action, for example:
1. Bookmark a post with an image
2. Retween a post with a special phrase like "save this"
3. Some other action?

The system will pick this up, and automatically aggregate the image into the system.
It is up to you to decide which way is best to store and serve the image in the system. I have listed two options below:

1. Save our "local" copy of the image onto servers, serve as normal when user requests
2. Store the twitter/X url as-is, and use their CDN to display the images (yay! less server costs, less pain, and we dont infringe on artists rights. This method is of course preferred so I would like you to look into it deeper)
3. Store locally on user's device?

Do not optimise for a big userbase just yet, I just want to get a beta product out for use. Each user should be able to see other user's moodboards, log in, sign up, delete account, and not much else. Keep the app minimal!

The frontend skeleton is already set up for you. It would be nice to optimize this app to load quickly. 

## Your task today: 
1. Research what architecture this app should use. I would prefer if the backend was done in JS. 
2. Come up with a plan for the backend and database. 
3. Write instructions for your human to sign for whatever service/API that are needed, but do not implement just yet!

---

## Completed planning deliverables (research + architecture + signup steps)

Date of research: 2026-02-22

This section completes the 3 tasks above without implementing anything yet.

## 1) Architecture research and recommendation (JS backend)

### What is feasible with X today (important constraints)

- `Bookmarks` are available via X API endpoints (`GET /2/users/:id/bookmarks`, plus POST/DELETE for managing bookmarks).
- Bookmarks are private and require user-authenticated access tokens (OAuth 2.0 PKCE / user context).
- X documents bookmark lookup as returning up to the authenticated user's most recent 800 bookmarked posts and provides user-level rate limits.
- X has webhook-style Account Activity APIs for some events, but the documented event list shows posts/DMs/follows/likes/etc. and does **not** list bookmark events.
- X API supports media expansions (`attachments.media_keys`) and `media.fields=url`, and the docs example returns a `pbs.twimg.com` media URL.

### Implication for this product

- `Bookmark trigger` is viable, but it should be implemented as **polling** (scheduled sync), not real-time webhook.
- `Retweet/repost with special phrase` is also viable using timeline polling on the user's posts/reposts.
- `Store X CDN image URL` is viable for beta, but only if we also store enough metadata to:
  - rehydrate missing URLs later
  - remove content if it becomes unavailable / restricted
  - preserve attribution and source links

### Recommendation (beta-first)

Use a **split app** architecture:

- `Frontend`: existing React + Vite app (already in repo)
- `Backend API`: Node.js (JavaScript) service (`Fastify` preferred, `Express` acceptable)
- `Worker / scheduled sync`: Node.js job (same codebase as backend, separate process/command)
- `Database + auth`: Supabase (`Postgres + Auth`)
- `Hosting`: Render (Web Service for API + Cron Job for scheduled sync)

### Why this is the best fit for your brief

- Minimal moving parts for a beta
- JS end-to-end on frontend + backend
- Fast signup/login/delete-account path via Supabase Auth
- No image storage bill at launch if using X CDN URLs
- Easy to swap in local image caching later if X CDN/display constraints become a problem

---

## 2) Backend and database plan

### Image storage decision (deeper look at preferred option #2)

### Chosen beta strategy: store X media URLs + metadata, not image bytes

Store:

- X post ID
- X post URL
- author username/display name (snapshot)
- post text (snapshot for display/search)
- media key(s)
- media URL (`pbs.twimg.com/...`)
- media type (`photo` / `video` / `gif`)
- width/height if available
- alt text if available
- timestamps (`post_created_at`, `ingested_at`, `last_synced_at`)
- visibility/status (`active`, `removed`, `unavailable`)

Do **not** store local image binaries in v1 (unless a later fallback feature is added).

### Why this is good for beta

- Lowest cost and ops overhead
- Preserves artist/source linkage better than copying files everywhere
- Faster to ship
- Matches your stated preference

### Risks and mitigations (important)

- X can change API behavior/terms/tier access:
  - Mitigation: keep ingestion behind one backend adapter layer
- Media URL may break or content may be deleted/protected:
  - Mitigation: store source post ID + media key + source URL, so you can re-fetch or mark unavailable
- Policy/display compliance matters:
  - Mitigation: store source attribution and link to original post, and add a removal workflow later

### High-level system design

### A. Frontend (existing Vite app)

- Reads public moodboards and images from backend API
- Authenticates users via Supabase Auth (email/password or magic link)
- Calls backend API with Supabase JWT for protected actions

### B. Backend API (Node.js, JavaScript)

Recommended stack:

- `Fastify` (HTTP API)
- `postgres` + `Drizzle ORM` (or `Prisma`, either is fine)
- `zod` for request validation
- `@supabase/supabase-js` for auth/admin operations when needed

Responsibilities:

- Moodboard CRUD (minimal)
- Public board read endpoints
- X account connection (OAuth callback handling)
- Triggering/monitoring sync jobs
- Account deletion orchestration (delete user data + unlink X)

### C. Sync worker (Node.js scheduled job)

Runs on a cron schedule (e.g. every 5-10 minutes per active user).

Responsibilities:

- Poll X bookmarks endpoint for each connected user
- Poll user posts timeline for "save this" repost/retweet pattern (optional feature flag)
- Normalize media + post metadata
- Dedupe and insert pins
- Update sync cursors (`since_id`, timestamps)

### D. Database + auth (Supabase)

Use Supabase for:

- Postgres database
- Auth (signup/login/session management)
- Optional RLS for read/write access controls

### API shape (MVP)

Public endpoints:

- `GET /api/boards` (public boards feed)
- `GET /api/boards/:boardId`
- `GET /api/boards/:boardId/items`

Authenticated endpoints:

- `POST /api/boards`
- `PATCH /api/boards/:boardId`
- `DELETE /api/boards/:boardId`
- `POST /api/x/connect/start`
- `GET /api/x/connect/callback`
- `POST /api/x/sync/run` (manual sync button)
- `DELETE /api/account` (delete account + data)

Admin/internal endpoints (cron/webhook-triggered, not public):

- `POST /internal/jobs/x-sync-user`
- `POST /internal/jobs/x-sync-all`

### Database schema (MVP)

Use UUIDs for internal records. Keep X IDs as strings.

#### `profiles`

- `id` (uuid, PK, matches Supabase auth user id)
- `username` (text, unique, nullable initially)
- `display_name` (text)
- `created_at`
- `deleted_at` (nullable, optional if soft delete)

#### `boards`

- `id` (uuid, PK)
- `owner_user_id` (uuid, FK -> profiles.id)
- `title` (text)
- `description` (text, nullable)
- `is_public` (bool, default true for beta simplicity)
- `created_at`
- `updated_at`

#### `board_items`

- `id` (uuid, PK)
- `board_id` (uuid, FK -> boards.id)
- `added_by_user_id` (uuid, FK -> profiles.id)
- `source_type` (text; e.g. `x_bookmark`, `x_repost_phrase`, `manual_link`)
- `source_post_id` (text, nullable)
- `source_post_url` (text, nullable)
- `source_author_id` (text, nullable)
- `source_author_username` (text, nullable)
- `title` (text, nullable; fallback generated)
- `caption` (text, nullable; snapshot of post text)
- `created_at`
- `sort_order` (numeric/int for manual ordering later)

#### `board_item_media`

- `id` (uuid, PK)
- `board_item_id` (uuid, FK -> board_items.id)
- `media_key` (text, nullable)
- `media_type` (text)
- `src_url` (text)  // X CDN URL for beta
- `width` (int, nullable)
- `height` (int, nullable)
- `alt_text` (text, nullable)
- `aspect_ratio` (numeric, nullable; can be derived and cached)
- `status` (text: `active`, `unavailable`, `removed`)
- `last_verified_at` (timestamp, nullable)
- `created_at`

#### `tags`

- `id` (uuid, PK)
- `name` (text, unique)

#### `board_item_tags`

- `board_item_id` (uuid, FK)
- `tag_id` (uuid, FK)
- composite PK (`board_item_id`, `tag_id`)

#### `x_connections`

- `id` (uuid, PK)
- `user_id` (uuid, FK -> profiles.id, unique for beta)
- `x_user_id` (text)
- `x_username` (text)
- `scopes` (text[] or jsonb)
- `access_token_encrypted` (text)
- `refresh_token_encrypted` (text, nullable)
- `token_expires_at` (timestamp, nullable)
- `created_at`
- `updated_at`
- `revoked_at` (timestamp, nullable)

#### `x_sync_state`

- `user_id` (uuid, PK/FK -> profiles.id)
- `bookmark_since_id` (text, nullable)
- `bookmark_next_token` (text, nullable)  // only if doing full backfill pagination
- `repost_since_id` (text, nullable)
- `last_bookmark_sync_at` (timestamp, nullable)
- `last_repost_sync_at` (timestamp, nullable)
- `last_sync_status` (text, nullable)
- `last_error` (text, nullable)

#### `x_ingestion_log` (optional but strongly recommended)

- `id` (uuid, PK)
- `user_id` (uuid)
- `source_post_id` (text)
- `event_type` (text)
- `dedupe_key` (text, unique)
- `result` (text: `inserted`, `skipped_duplicate`, `skipped_no_media`, `failed`)
- `error_message` (text, nullable)
- `created_at`

### Minimal product behavior (beta scope)

- Each user gets one default board on signup (can expand later)
- Users can see public boards from other users
- X sync only imports posts that contain image media (ignore video/GIF initially if needed)
- Tag extraction can start simple:
  - manual tags only
  - or basic hashtag parsing from X post text

### Sync strategy (recommended beta behavior)

#### Bookmark import

- Poll X bookmarks endpoint on schedule
- Use latest seen post ID / paging token to avoid full re-syncs
- Fetch expansions for authors + media
- Import only media posts

#### Repost/retweet "save this" import

- Poll user's timeline
- Check for repost/retweet posts and phrase match in text (e.g. `save this`)
- Feature-flag this path, because bookmarks are the cleaner v1 experience

### Account deletion plan

When user deletes account:

- Mark profile as deleting
- Revoke/delete stored X tokens (best effort)
- Delete boards/items/tags via DB cascade
- Delete auth user (via backend using Supabase service-role key)
- Return confirmation and sign out client

---

## 3) Signup instructions for human (services / APIs only, no implementation)

### Service checklist (minimum)

You should sign up for:

1. `X Developer` (API access, OAuth app, bookmark/timeline access)
2. `Supabase` (Postgres + Auth)
3. `Render` (Node API hosting + cron jobs)

### A) X Developer setup (required)

Goal: obtain OAuth credentials for user-authorized bookmark reads and timeline reads.

1. Create/sign in to an X account you will use for development.
2. Go to the X Developer Console and create a developer account (if not already approved).
3. Create a `Project` and an `App`.
4. Enable `OAuth 2.0` for the App (PKCE flow).
5. Add callback URLs (prepare both now):
   - local: `http://localhost:3000/auth/x/callback` (or your chosen frontend callback)
   - backend callback (preferred): `http://localhost:8787/api/x/connect/callback` (example)
   - production callback (placeholder for later): `https://api.yourdomain.com/api/x/connect/callback`
6. Record these values securely:
   - `X_CLIENT_ID`
   - `X_CLIENT_SECRET` (if issued / confidential client mode)
   - app/project identifiers shown in console
7. Confirm scopes you will request in OAuth:
   - `tweet.read`
   - `users.read`
   - `bookmark.read`
   - `offline.access` (important for refresh tokens and background sync)
8. Optional later if you want app-managed bookmarking:
   - `bookmark.write`
9. Before paying/selecting a tier, verify in the current portal/docs that your plan includes:
   - Bookmarks endpoints
   - User timelines endpoints
   - OAuth 2.0 PKCE user auth

Note: X access tiers/pricing and availability change often. Re-check in the Developer Console at signup time.

### B) Supabase setup (required)

Goal: hosted Postgres + Auth for signup/login/delete-account support.

1. Create a Supabase account and sign in to the dashboard.
2. Create a new project.
3. Save project credentials (you will need these later):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (backend only, never frontend)
   - DB password / connection string
4. In `Authentication`, choose your beta auth method:
   - fastest: magic link / OTP email
   - also fine: email + password
5. In `Authentication -> URL Configuration`, set:
   - Site URL (frontend local/prod later)
   - Additional Redirect URLs (all callback URLs you plan to use)
6. In `Authentication`, keep email templates/defaults for now (customize later only if needed).
7. Optional but recommended:
   - Create a separate project for dev and prod (not one shared project)

### C) Render setup (required for hosted beta backend + scheduler)

Goal: host Node API and run scheduled sync jobs without managing servers.

1. Create a Render account and connect GitHub.
2. Create a `Web Service` for the future backend API (Node.js).
3. Create a `Cron Job` for future X sync runs (same repo, different command).
4. Prepare an environment group (or repeated env vars) for:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` (only if backend needs it)
   - `X_CLIENT_ID`
   - `X_CLIENT_SECRET`
   - `X_REDIRECT_URI`
   - `ENCRYPTION_KEY` (for encrypting X tokens at rest)
5. Decide a cron schedule for beta (recommended starting point):
   - every 10 minutes for active users
6. Reserve production domains later:
   - API: `api.yourdomain.com`
   - Frontend: `yourdomain.com`

### D) Optional services (not required for v1)

- `Sentry` for error monitoring
- `Cloudflare R2 / S3` only if you later add image caching/fallback
- `Resend/Postmark` if you outgrow default auth emails

---

## Suggested implementation sequence (when you start coding)

1. Set up Supabase auth + DB schema
2. Build minimal Node API for boards/items
3. Implement X OAuth connect flow
4. Implement manual sync endpoint for one user
5. Add scheduled sync worker/cron
6. Swap frontend from static `data.js` to API responses
7. Add delete-account flow

---

## Notes for this repo specifically (based on current frontend)

- Your current frontend item shape already maps nicely to `board_item_media` + `board_items` fields:
  - `title`, `artist`, `year`, `src`, `aspectRatio`, `tags`
- This means backend integration can be introduced gradually without redesigning the UI first.
- For quick loading later, prioritize:
  - pagination/infinite loading in grid view
  - image `loading="lazy"`
  - serving scaled X image variants where possible
  - caching API JSON responses

---

## Sources used (official docs where possible)

X / Twitter Developer Platform

- Bookmarks overview: https://docs.x.com/x-api/posts/bookmarks/introduction
- Bookmarks lookup quickstart (required scopes): https://docs.x.com/x-api/posts/bookmarks/quickstart/bookmarks-lookup
- Manage bookmarks quickstart (`bookmark.write` scopes): https://docs.x.com/x-api/posts/bookmarks/quickstart/manage-bookmarks
- Bookmarks integration guide (rate limits / 800 recent bookmarks): https://docs.x.com/x-api/posts/bookmarks/integrate
- Timelines overview (user/home timelines, filtering incl. `since_id`): https://docs.x.com/x-api/posts/timelines/introduction
- Expansions and media fields (`attachments.media_keys`, `media.fields=url`): https://docs.x.com/x-api/fundamentals/expansions
- OAuth 2.0 PKCE + refresh token / `offline.access`: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Account Activity API (webhooks; event types list): https://docs.x.com/x-api/account-activity/introduction
- Developer Agreement and Policy (terms, display/policy references, removals): https://developer.x.com/en/developer-terms/agreement-and-policy
- Developer Policy (public display rules): https://developer.x.com/developer-terms/policy
- Display requirements (posts): https://developer.x.com/developer-terms/display-requirements

Supabase

- Platform overview (projects include Postgres/Auth/etc.): https://supabase.com/docs/guides/platform
- Auth overview: https://supabase.com/docs/guides/auth
- Passwordless email/magic link docs (Site URL + redirect URLs): https://supabase.com/docs/guides/auth/auth-email-passwordless

Render

- Web services (Node hosting): https://render.com/docs/web-services
- Cron jobs (scheduled tasks): https://render.com/docs/cronjobs
