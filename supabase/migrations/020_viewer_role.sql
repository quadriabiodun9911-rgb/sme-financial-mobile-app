-- Adds the 'viewer' role -- pure read-only access, the role the product
-- memo's Owner/Admin/Finance Manager/Accountant/Staff/Viewer model puts in
-- its first-tier set (alongside external_accountant, added in migration
-- 018, which the memo lists as a later addition).
--
-- Enforced in the app at src/utils/rolePermissions.ts via screen
-- exclusion, same mechanism as 'staff' and 'external_accountant': a
-- viewer's screen allowlist excludes every screen that has a write action
-- on it (transactions, invoices, inventory, reconciliation, import, budget,
-- goals, assets, loans, settings), so there's no UI path to a mutation,
-- not a per-action permission check on every write call site. This
-- constraint only stops garbage values reaching the column.
--
-- Idempotent: safe to run repeatedly.

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('accountant', 'manager', 'staff', 'admin', 'external_accountant', 'viewer'));
