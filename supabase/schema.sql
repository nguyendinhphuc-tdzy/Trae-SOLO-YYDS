create table if not exists public.vip_clients (
  chat_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.event_logs (
  message_id text primary key,
  created_at timestamptz not null default now()
);

