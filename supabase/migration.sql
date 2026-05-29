-- ==========================================
-- SUPABASE SCHEMA MIGRATION
-- Run this in your Supabase SQL Editor
-- ==========================================

-- --- Clients ---
create table if not exists public.clients (
  chat_id text primary key,
  display_name text,
  assignee_id text,
  assignee_name text,
  ticket_count integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- --- Tickets ---
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  client_name text,
  summary text not null,
  description text,
  priority text check (priority in ('High', 'Medium')) default 'Medium',
  status text check (status in ('Open', 'In Progress', 'Done', 'Closed')) default 'Open',
  assignee_id text,
  assignee_name text,
  ai_reason text,
  jira_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_chat_id_idx on public.tickets(chat_id);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_priority_idx on public.tickets(priority);
create index if not exists tickets_created_at_idx on public.tickets(created_at desc);

-- --- Conversations ---
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  client_name text,
  message_id text,
  direction text check (direction in ('inbound', 'outbound')) default 'inbound',
  text text,
  ai_decision text,
  ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_chat_id_idx on public.conversations(chat_id);
create index if not exists conversations_created_at_idx on public.conversations(created_at desc);
create index if not exists conversations_ticket_id_idx on public.conversations(ticket_id);

-- --- Analytics Events ---
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_idx on public.analytics_events(event_type);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);

-- --- Settings ---
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- --- Increment Ticket Count Function ---
create or replace function public.increment_ticket_count(p_chat_id text)
returns void as $$
begin
  update public.clients
  set ticket_count = coalesce(ticket_count, 0) + 1,
      last_seen_at = now()
  where chat_id = p_chat_id;
end;
$$ language plpgsql security definer;

-- ==========================================
-- EXISTING TABLES (keep as-is)
-- ==========================================
-- vip_clients, event_logs already exist from previous schema
