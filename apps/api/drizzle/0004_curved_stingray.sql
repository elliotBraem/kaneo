-- Remove any duplicate workspace_member records before adding the unique constraint
-- Keep only the most recent record for each workspace_id, user_id combination
DELETE FROM "workspace_member" 
WHERE id NOT IN (
  SELECT DISTINCT ON (workspace_id, user_id) id
  FROM "workspace_member"
  ORDER BY workspace_id, user_id, joined_at DESC
);

-- =================================================================
-- Adding "organization" better-auth plugin
-- workspace maps to organization, so we need to migrate to owners
-- and any "pending" workspace_member is an invitation now
-- =================================================================

-- Add unique constraint for workspace_member (needed for UPSERT)
ALTER TABLE "workspace_member" 
ADD CONSTRAINT "workspace_member_workspace_id_user_id_unique" 
UNIQUE ("workspace_id", "user_id");

-- Create invitation table
CREATE TABLE IF NOT EXISTS "invitation" (
    "id" text PRIMARY KEY NOT NULL,
    "workspace_id" text NOT NULL,
    "email" text NOT NULL,
    "role" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "expires_at" timestamp NOT NULL,
    "inviter_id" text NOT NULL
);

-- Part A: Migrate existing workspace owners from the `owner_id` column
-- into the `workspace_member` table with the role of "owner".
INSERT INTO "workspace_member" (
  id,
  workspace_id,
  user_id,
  role,
  status,
  joined_at
)
SELECT
  gen_random_uuid()::text,
  w.id,
  w.owner_id,
  'owner',
  'active',
  NOW()
FROM
  "workspace" w
WHERE
  w.owner_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) -- If a membership for this user/workspace already exists...
DO UPDATE SET
  role = 'owner'; -- ...just update their role to 'owner'.

-- Part B: Migrate existing "pending" members to invitation table
INSERT INTO "invitation" (
  id,
  workspace_id,
  email,
  role,
  status,
  expires_at,
  inviter_id
)
SELECT
  gen_random_uuid()::text,
  wm.workspace_id,
  u.email,
  wm.role,
  'pending',
  NOW() + INTERVAL '1 month',
  COALESCE(
    (SELECT user_id FROM workspace_member owner WHERE owner.workspace_id = wm.workspace_id AND owner.role = 'owner' LIMIT 1),
    -- Fallback: use the first user if no owner is found yet
    (SELECT id FROM "user" LIMIT 1)
  )
FROM
  "workspace_member" wm
JOIN
  "user" u ON wm.user_id = u.id
WHERE
  wm.status = 'pending'
ON CONFLICT DO NOTHING; -- Avoid duplicate invitations if migration runs multiple times

-- =================================================================
-- Schema Changes
-- =================================================================

-- Add new columns
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "active_workspace_id" text;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "active_team_id" text;
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "logo" text;
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "metadata" text;
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "team_id" text;

-- Drop columns
ALTER TABLE "workspace" DROP COLUMN IF EXISTS "owner_id";
ALTER TABLE "workspace_member" DROP COLUMN IF EXISTS "status";


-- Create team tables
CREATE TABLE IF NOT EXISTS "team" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "workspace_id" text NOT NULL,
    "created_at" timestamp NOT NULL,
    "updated_at" timestamp
);


CREATE TABLE IF NOT EXISTS "team_member" (
    "id" text PRIMARY KEY NOT NULL,
    "team_id" text NOT NULL,
    "user_id" text NOT NULL,
    "created_at" timestamp
);

-- Add contraints

ALTER TABLE "workspace" ADD CONSTRAINT IF NOT EXISTS "workspace_slug_unique" UNIQUE("slug");
ALTER TABLE "invitation" ADD CONSTRAINT IF NOT EXISTS "invitation_workspace_id_workspace_id_fk" 
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT IF NOT EXISTS "invitation_inviter_id_user_id_fk" 
    FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "team" ADD CONSTRAINT IF NOT EXISTS "team_workspace_id_workspace_id_fk" 
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "team_member" ADD CONSTRAINT IF NOT EXISTS "team_member_team_id_team_id_fk" 
    FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;
ALTER TABLE "team_member" ADD CONSTRAINT IF NOT EXISTS "team_member_user_id_user_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
