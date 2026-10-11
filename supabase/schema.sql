-- ==============================================================================
-- MARGINALIA SHIELDED POOL — SUPABASE POSTGRESQL SCHEMA MIGRATION
-- Run this script in the Supabase SQL Editor (https://app.supabase.com)
-- ==============================================================================

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. TABLE: folio_leaves
-- Stores all on-chain Merkle tree leaves (commitments) in strict sequential order.
-- ------------------------------------------------------------------------------
create table if not exists public.folio_leaves (
    leaf_index bigint primary key,
    leaf_commitment text not null,
    pool_address text not null,
    chain_id bigint not null default 46630,
    block_number bigint not null,
    tx_hash text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_folio_leaves_commitment on public.folio_leaves(leaf_commitment);
create index if not exists idx_folio_leaves_block on public.folio_leaves(block_number);

-- ------------------------------------------------------------------------------
-- 3. TABLE: deposits
-- Records all deposit events for Magistrate ASP screening and provenance audits.
-- ------------------------------------------------------------------------------
create table if not exists public.deposits (
    label text primary key,
    depositor text not null,
    commitment text not null,
    value text not null,
    precommitment text not null,
    token_address text not null default '0x0000000000000000000000000000000000000000',
    leaf_index bigint not null,
    status text not null default 'PENDING_SCREENING', -- 'PENDING_SCREENING', 'APPROVED', 'DENIED', 'RAGEQUIT'
    block_number bigint not null,
    tx_hash text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_deposits_depositor on public.deposits(depositor);
create index if not exists idx_deposits_status on public.deposits(status);
create index if not exists idx_deposits_commitment on public.deposits(commitment);

-- ------------------------------------------------------------------------------
-- 4. TABLE: nullifiers
-- Tracks spent Wax Seals (nullifiers) to prevent double-spends before mempool broadcast.
-- ------------------------------------------------------------------------------
create table if not exists public.nullifiers (
    nullifier_hash text primary key,
    spent_type text not null default 'WITHDRAW', -- 'WITHDRAW' or 'RAGEQUIT'
    spent_block bigint not null,
    tx_hash text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 5. TABLE: asp_roots
-- Stores historical Association Set Provider (ASP) label tree roots and IPFS pointers.
-- ------------------------------------------------------------------------------
create table if not exists public.asp_roots (
    root text primary key,
    ipfs_cid text not null,
    approved_labels_count integer not null default 0,
    published_by text not null,
    tx_hash text not null,
    published_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 6. TABLE: relayer_jobs
-- Manages withdrawal transaction queue dispatched by the Mersenne Courier Relayer.
-- ------------------------------------------------------------------------------
create table if not exists public.relayer_jobs (
    id uuid primary key default uuid_generate_v4(),
    recipient text not null,
    relayer_address text not null,
    fee text not null,
    nullifier_hash text not null,
    status text not null default 'QUEUED', -- 'QUEUED', 'BROADCASTING', 'CONFIRMED', 'FAILED'
    tx_hash text,
    gas_used text,
    error_message text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_relayer_jobs_status on public.relayer_jobs(status);
create index if not exists idx_relayer_jobs_nullifier on public.relayer_jobs(nullifier_hash);

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Public has read access for verification; only service role has write access.
-- ------------------------------------------------------------------------------
alter table public.folio_leaves enable row level security;
alter table public.deposits enable row level security;
alter table public.nullifiers enable row level security;
alter table public.asp_roots enable row level security;
alter table public.relayer_jobs enable row level security;

-- Public READ policies
create policy "Allow public read access to folio_leaves" on public.folio_leaves for select using (true);
create policy "Allow public read access to deposits" on public.deposits for select using (true);
create policy "Allow public read access to nullifiers" on public.nullifiers for select using (true);
create policy "Allow public read access to asp_roots" on public.asp_roots for select using (true);
create policy "Allow public read access to relayer_jobs" on public.relayer_jobs for select using (true);

-- Service role FULL ACCESS policies
create policy "Service role manage folio_leaves" on public.folio_leaves for all using (auth.role() = 'service_role');
create policy "Service role manage deposits" on public.deposits for all using (auth.role() = 'service_role');
create policy "Service role manage nullifiers" on public.nullifiers for all using (auth.role() = 'service_role');
create policy "Service role manage asp_roots" on public.asp_roots for all using (auth.role() = 'service_role');
create policy "Service role manage relayer_jobs" on public.relayer_jobs for all using (auth.role() = 'service_role');

-- ==============================================================================
-- FASE 03 ADDITIONS (same content as supabase/migrations/20261009000000_phase3_magistrate.sql)
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
