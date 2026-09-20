-- Team chat: one shared message channel per business workspace, so an
-- owner and their invited team members (accountant, manager, staff, admin,
-- external accountant, viewer) can leave each other messages when they're
-- not around at the same time. Separate from the workspace_tables loop in
-- 017_workspace_rls_for_team_members.sql because a message has its own
-- actor model -- it's attributed to whichever person sent it, not silently
-- owned by the workspace the way a transaction or invoice row is.
--
-- sender_name/sender_role are denormalized onto the row at send time
-- (rather than joined from profiles/team_members at read time) because
-- profiles' RLS only ever lets a caller read their OWN row (see
-- 007_merchant_financing_and_rls_gaps.sql) -- a teammate reading the chat
-- has no way to resolve another sender's name via a join, only via what
-- that sender's own insert already recorded.

CREATE TABLE IF NOT EXISTS team_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name text NOT NULL,
    sender_role text NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_chat_messages_workspace_idx
    ON team_chat_messages (workspace_owner_id, created_at);

ALTER TABLE team_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_chat_read" ON team_chat_messages;
DROP POLICY IF EXISTS "team_chat_send" ON team_chat_messages;

-- Read: the workspace owner, or anyone with an ACTIVE team_members row
-- linking them to that owner -- same membership check as the workspace
-- tables in migration 017.
CREATE POLICY "team_chat_read" ON team_chat_messages
    FOR SELECT
    USING (
        workspace_owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = team_chat_messages.workspace_owner_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );

-- Send: same membership check, plus the message must be attributed to the
-- real caller -- nobody can post as someone else.
CREATE POLICY "team_chat_send" ON team_chat_messages
    FOR INSERT
    WITH CHECK (
        sender_user_id = auth.uid()
        AND (
            workspace_owner_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM team_members tm
                WHERE tm.owner_user_id = team_chat_messages.workspace_owner_id
                  AND tm.member_user_id = auth.uid()
                  AND tm.status = 'active'
            )
        )
    );

-- No UPDATE/DELETE policy -- messages are immutable once sent, same
-- append-only model as audit_logs elsewhere in this schema.
