-- Backfills a real, long-standing gap found via the Portfolio screen: every
-- account that signed up through the normal flow (setupAccount in
-- OptimizedContexts.tsx) had its settings row written with NO businessName
-- field at all -- DEFAULT_SETTINGS never included one, and the signup
-- form's typed business name only ever reached the local profile/
-- `profiles` row (saveProfile), never `settings`. Invisible everywhere
-- that reads a business's name off the signed-in identity's own profile
-- (the header, the switcher's Current row), but a real, user-facing gap
-- anywhere that reads it off the settings row directly: Settings' own form
-- showed a blank, Save-blocking business-name field, and
-- getBusinessNameForOwner/Portfolio showed a generic "Business"
-- placeholder. Shadow businesses (create-business) never had this gap --
-- their settings row always included businessName from creation.
--
-- The client-side fix (setupAccount now always writes businessName) only
-- helps NEW signups; this backfills every account already affected, using
-- profiles.business_name -- saveProfile has always kept that column
-- correct, and it's exactly the value this should have been all along.
--
-- Idempotent: the WHERE clause only touches rows still missing
-- businessName, so re-running this is a no-op once applied.

UPDATE settings s
SET data = jsonb_set(s.data, '{businessName}', to_jsonb(p.business_name))
FROM profiles p
WHERE s.user_id = p.id
  AND p.business_name IS NOT NULL
  AND p.business_name <> ''
  AND (s.data->>'businessName' IS NULL OR s.data->>'businessName' = '');
