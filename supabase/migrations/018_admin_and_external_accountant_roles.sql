-- Widens team_members.role to add 'admin' and 'external_accountant', the
-- two roles from the Owner/Admin/Finance Manager/Accountant/Staff/External
-- Accountant model that weren't yet represented (Finance Manager already
-- maps onto the existing 'manager' role).
--
--   admin               everything owner can do except delete business
--                       data outright -- can manage the team, payment
--                       settings, and publish to lenders.
--   external_accountant read-heavy: full financial visibility (like
--                       accountant/manager) but restricted to reporting/
--                       reconciliation screens -- no team management, no
--                       payment settings, no publishing to lenders. Meant
--                       for a bookkeeper or auditor outside the business
--                       who needs to see the numbers, not run operations.
--
-- Enforced in the app at src/utils/rolePermissions.ts, same as the
-- 'manager' role added in 016 -- this constraint only stops garbage values
-- reaching the column.
--
-- Idempotent: safe to run repeatedly.

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('accountant', 'manager', 'staff', 'admin', 'external_accountant'));
