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
