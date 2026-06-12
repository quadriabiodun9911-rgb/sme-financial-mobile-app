-- FinanceBook SME — Complete Supabase Database Setup
-- Run this entire script in Supabase → SQL Editor → New query

-- ─── 1. PROFILES ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  business_name text not null default '',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── 2. SETTINGS ─────────────────────────────────────────────────────────────
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table settings enable row level security;
create policy "Users manage own settings"
  on settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 3. TRANSACTIONS ─────────────────────────────────────────────────────────
create table if not exists transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "Users manage own transactions"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 4. GOALS ────────────────────────────────────────────────────────────────
create table if not exists goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users manage own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 5. INVOICES ─────────────────────────────────────────────────────────────
create table if not exists invoices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table invoices enable row level security;
create policy "Users manage own invoices"
  on invoices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 6. ASSETS ───────────────────────────────────────────────────────────────
create table if not exists assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table assets enable row level security;
create policy "Users manage own assets"
  on assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 7. INVENTORY ────────────────────────────────────────────────────────────
create table if not exists inventory (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  category text,
  quantity numeric not null default 0,
  unit text,
  cost_price numeric not null default 0,
  selling_price numeric,
  low_stock_threshold numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table inventory enable row level security;
create policy "Users manage own inventory"
  on inventory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 8. TEAM MEMBERS ─────────────────────────────────────────────────────────
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  member_user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('accountant', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  invite_code text not null,
  invited_at timestamptz default now()
);
alter table team_members enable row level security;
create policy "Owners manage their team"
  on team_members for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
create policy "Members can join via invite code"
  on team_members for select
  using (true);
create policy "Members can activate themselves"
  on team_members for update
  using (status = 'pending');

-- ─── 9. AUDIT LOGS ───────────────────────────────────────────────────────────
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details jsonb,
  severity text default 'low',
  timestamp timestamptz default now()
);
alter table audit_logs enable row level security;
create policy "Users read own audit logs"
  on audit_logs for select
  using (auth.uid() = user_id);
create policy "Users insert own audit logs"
  on audit_logs for insert
  with check (auth.uid() = user_id);

-- ─── 10. TWO FACTOR AUTH ─────────────────────────────────────────────────────
create table if not exists two_factor_auth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  method text,
  status text default 'disabled',
  secret text,
  phone_number text,
  backup_codes text[],
  created_at timestamptz default now(),
  verified_at timestamptz,
  updated_at timestamptz default now()
);
alter table two_factor_auth enable row level security;
create policy "Users manage own 2FA"
  on two_factor_auth for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
