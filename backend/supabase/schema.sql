-- Run this in Supabase SQL Editor before using the backend with Supabase storage.
-- This schema is backend-first and assumes API access is performed through the backend using the service role key.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  username text unique,
  display_name text not null default 'User',
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists boards_owner_user_unique_idx
on public.boards (owner_user_id);

create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  added_by_user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_post_id text not null,
  source_post_url text,
  source_author_id text,
  source_author_username text,
  source_author_display_name text,
  title text,
  caption text,
  created_at timestamptz not null default now()
);

create unique index if not exists board_items_x_dedupe_idx
on public.board_items (board_id, source_type, source_post_id);

create table if not exists public.board_item_media (
  id uuid primary key default gen_random_uuid(),
  board_item_id uuid not null references public.board_items(id) on delete cascade,
  media_key text,
  media_type text not null,
  src_url text not null,
  width integer,
  height integer,
  alt_text text,
  aspect_ratio double precision,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create unique index if not exists board_item_media_item_src_idx
on public.board_item_media (board_item_id, src_url);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.board_item_tags (
  board_item_id uuid not null references public.board_items(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (board_item_id, tag_id)
);

create table if not exists public.x_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_verifier text not null,
  requested_scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.x_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  x_user_id text not null,
  x_username text not null,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  token_type text not null default 'bearer',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Legacy bookmark_* column names are still used as the sync cursor fields for compatibility.
create table if not exists public.x_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bookmark_since_id text,
  bookmark_next_token text,
  last_bookmark_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.x_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  triggered_by text not null default 'manual',
  status text not null default 'queued',
  items_created integer not null default 0,
  items_updated integer not null default 0,
  raw_result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row
execute function public.set_updated_at();

drop trigger if exists x_connections_set_updated_at on public.x_connections;
create trigger x_connections_set_updated_at
before update on public.x_connections
for each row
execute function public.set_updated_at();

drop trigger if exists x_sync_state_set_updated_at on public.x_sync_state;
create trigger x_sync_state_set_updated_at
before update on public.x_sync_state
for each row
execute function public.set_updated_at();
