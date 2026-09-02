-- A second, optional way into an account that doesn't depend on any one
-- device already holding a locally-cached secret (see the password-login
-- edge function for the full flow this supports). Keyed by email, not
-- user_id: the one place this table is read from is the login attempt
-- itself, before there is any session to resolve a user_id from, and
-- resolving email -> user_id there would need its own admin lookup for no
-- benefit -- the actual session gets minted from the email directly via
-- supabase.auth.admin.generateLink.
--
-- Deliberately separate from auth.users' own password. That field is
-- already used as each device's own rotating high-entropy secret (see
-- generateAuthSecret/saveAuthSecret in storage.ts) -- routine flows like a
-- PIN reset on any OTHER device overwrite it freely. A backup password the
-- user actually chose and means to remember must not get silently
-- invalidated by an unrelated device doing its own thing, so it lives here
-- instead, verified independently by the edge function before minting a
-- real session.
-- failed_attempts/locked_until enforce the same 5-attempts/15-minutes
-- lockout the PIN already uses (see OptimizedContexts.tsx's login()), but
-- server-side here -- this table backs the one login path in the app an
-- attacker can call directly with no session and no per-device throttling
-- of their own, so the limit has to live where they can't route around it.
create table if not exists account_backup_password (
    email text primary key,
    password_hash text not null,
    failed_attempts int not null default 0,
    locked_until timestamptz,
    updated_at timestamptz not null default now()
);

alter table account_backup_password enable row level security;

-- No client-facing policies: only the password-login edge function's
-- service-role client ever reads or writes this table, exactly like
-- payment_provider_secrets (see 025_payment_provider_secrets.sql). RLS with
-- no policies denies all access from the anon/authenticated roles the
-- client actually uses, which is the point -- a stolen anon key must never
-- be able to read a password hash or plant one for an account it doesn't
-- own.
