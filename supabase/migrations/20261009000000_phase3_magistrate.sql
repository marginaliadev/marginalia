-- ==============================================================================
-- MARGINALIA: Fase 03 migration: automated Magistrate state, decision audit log, ASP root index, relayer cost tracking.
-- Run in the Supabase SQL Editor (or `supabase db push`). Idempotent: safe to run more than once.
-- Verify afterwards with:  node scripts/supabase-check.js
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. magistrate_state: one row per pool (scan cursor, ragequit labels, last publication).
--    The chain remains the source of truth: if this table is lost the worker rebuilds it by rescanning.
-- ------------------------------------------------------------------------------
create table if not exists public.magistrate_state (
    pool_address text primary key,
    cursor bigint,
    ragequit jsonb not null default '[]'::jsonb,
    last_publish jsonb,
    pending_since bigint,
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. magistrate_deposits: every deposit the worker has seen and its CURRENT screening verdict.
--    Contains depositor addresses and verdicts: NOT public (service role only).
-- ------------------------------------------------------------------------------
create table if not exists public.magistrate_deposits (
    pool_address text not null,
    label text not null,
    depositor text not null,
    value text not null,
    block_number bigint not null,
    ord bigint not null,
    decision text,            -- APPROVE | DENY | RAGEQUIT | null (not screened yet)
    reason text,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    primary key (pool_address, label)
);
create index if not exists idx_magistrate_deposits_decision on public.magistrate_deposits(pool_address, decision);

-- ------------------------------------------------------------------------------
-- 3. asp_decisions: APPEND-ONLY audit log of every change of verdict and every publication.
--    Enforced by a trigger: rows can never be updated or deleted, not even by the service role.
-- ------------------------------------------------------------------------------
create table if not exists public.asp_decisions (
    id bigint generated always as identity primary key,
    pool_address text not null,
    event text not null default 'decision',   -- 'decision' | 'published'
    label text,
    depositor text,
    from_decision text,
    to_decision text,
    reason text,
    root text,
    ipfs_cid text,
    tx_hash text,
    detail jsonb,
    created_at timestamp with time zone not null default timezone('utc'::text, now())
);
create index if not exists idx_asp_decisions_pool_time on public.asp_decisions(pool_address, created_at desc);
create index if not exists idx_asp_decisions_label on public.asp_decisions(label);

create or replace function public.asp_decisions_append_only() returns trigger
language plpgsql as $$
begin
    raise exception 'asp_decisions is append-only (% blocked)', tg_op;
end;
$$;

drop trigger if exists asp_decisions_no_update on public.asp_decisions;
create trigger asp_decisions_no_update
    before update or delete on public.asp_decisions
    for each row execute function public.asp_decisions_append_only();

-- ------------------------------------------------------------------------------
-- 4. asp_roots (already exists): add provenance columns. One row per published root.
-- ------------------------------------------------------------------------------
alter table public.asp_roots add column if not exists register_address text;
alter table public.asp_roots add column if not exists chain_id bigint;
alter table public.asp_roots add column if not exists document_sha256 text;
alter table public.asp_roots add column if not exists previous_cid text;
create index if not exists idx_asp_roots_published on public.asp_roots(published_at desc);

-- ------------------------------------------------------------------------------
-- 5. relayer_jobs (already exists): cost tracking for the Courier (gas actually paid vs fee received).
-- ------------------------------------------------------------------------------
alter table public.relayer_jobs add column if not exists gas_estimate text;
alter table public.relayer_jobs add column if not exists gas_cost_wei text;
alter table public.relayer_jobs add column if not exists fee_wei text;
alter table public.relayer_jobs add column if not exists net_wei text;

-- ------------------------------------------------------------------------------
-- 6. Row level security
--    magistrate_* and asp_decisions: service role ONLY (screening verdicts are not public).
--    asp_roots already has public read (the list is public by design).
-- ------------------------------------------------------------------------------
alter table public.magistrate_state enable row level security;
alter table public.magistrate_deposits enable row level security;
alter table public.asp_decisions enable row level security;

drop policy if exists "Service role manage magistrate_state" on public.magistrate_state;
create policy "Service role manage magistrate_state" on public.magistrate_state for all using (auth.role() = 'service_role');
drop policy if exists "Service role manage magistrate_deposits" on public.magistrate_deposits;
create policy "Service role manage magistrate_deposits" on public.magistrate_deposits for all using (auth.role() = 'service_role');
drop policy if exists "Service role manage asp_decisions" on public.asp_decisions;
create policy "Service role manage asp_decisions" on public.asp_decisions for select using (auth.role() = 'service_role');
drop policy if exists "Service role append asp_decisions" on public.asp_decisions;
create policy "Service role append asp_decisions" on public.asp_decisions for insert with check (auth.role() = 'service_role');
