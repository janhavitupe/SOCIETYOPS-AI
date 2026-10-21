-- Multi-society foundation.
--
-- Moves the single-society data into a Society row ("society-main"), replaces
-- ResidentProfile/ResidentPassword with Better Auth's User/Account plus
-- Membership (roles) and FlatOccupant (who lives where), and turns the free-text
-- flat numbers into Tower and Flat records.

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE "Society" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "pinCode" TEXT NOT NULL DEFAULT '',
    "logoKey" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "onboardingStep" TEXT,
    "joinCode" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "phoneNumber" TEXT,
    "phoneNumberVerified" BOOLEAN,
    "platformRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeSocietyId" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tower" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tower',
    "floors" INTEGER,
    "liftsCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tower_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "towerId" TEXT,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "type" TEXT,
    "carpetAreaSqft" INTEGER,
    "parkingSlots" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlatOccupant" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moveInDate" TIMESTAMP(3),
    "moveOutDate" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlatOccupant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommonArea" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "towerId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CommonArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "towerId" TEXT,
    "commonAreaId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "make" TEXT,
    "serialNumber" TEXT,
    "amcVendorId" TEXT,
    "amcExpiresOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL,
    "flatId" TEXT,
    "occupantType" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The existing society. Named from SocietyProfile when there is one; created
-- at all only when there is data to own.
-- ---------------------------------------------------------------------------

DELETE FROM "SocietyProfile" WHERE "id" NOT IN (SELECT "id" FROM "SocietyProfile" ORDER BY "id" LIMIT 1);

INSERT INTO "Society" ("id", "name", "address", "status", "joinCode", "updatedAt")
SELECT 'society-main',
       COALESCE((SELECT "societyName" FROM "SocietyProfile" LIMIT 1), 'My Society'),
       COALESCE((SELECT "address" FROM "SocietyProfile" LIMIT 1), ''),
       'active',
       upper(substr(md5(random()::text), 1, 8)),
       CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "SocietyProfile")
   OR EXISTS (SELECT 1 FROM "Ticket")
   OR EXISTS (SELECT 1 FROM "Vendor")
   OR EXISTS (SELECT 1 FROM "ResidentProfile");

-- Every existing row belongs to it.
ALTER TABLE "AgentActivityLog" ADD COLUMN "societyId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "societyId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN "societyId" TEXT;
ALTER TABLE "SocietyProfile" ADD COLUMN "societyId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "societyId" TEXT,
                     ADD COLUMN "assetId" TEXT,
                     ADD COLUMN "commonAreaId" TEXT,
                     ADD COLUMN "flatId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "societyId" TEXT;

UPDATE "AgentActivityLog" SET "societyId" = 'society-main';
UPDATE "ChatMessage" SET "societyId" = 'society-main';
UPDATE "NotificationLog" SET "societyId" = 'society-main';
UPDATE "SocietyProfile" SET "societyId" = 'society-main';
UPDATE "Ticket" SET "societyId" = 'society-main';
UPDATE "Vendor" SET "societyId" = 'society-main';

ALTER TABLE "AgentActivityLog" ALTER COLUMN "societyId" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "societyId" SET NOT NULL;
ALTER TABLE "NotificationLog" ALTER COLUMN "societyId" SET NOT NULL;
ALTER TABLE "SocietyProfile" ALTER COLUMN "societyId" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "societyId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "societyId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Residents become users. A phone is one person, so residents registered in
-- several flats with the same phone collapse into the earliest-created row.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE resident_user_map AS
SELECT r."id" AS resident_id,
       first_value(r."id") OVER (PARTITION BY r."phone" ORDER BY r."createdAt", r."id") AS user_id
FROM "ResidentProfile" r;

INSERT INTO "User" ("id", "name", "email", "emailVerified", "phoneNumber", "phoneNumberVerified", "createdAt", "updatedAt")
SELECT r."id",
       r."name",
       CASE
         WHEN nullif(btrim(r."email"), '') IS NOT NULL
          AND row_number() OVER (PARTITION BY lower(btrim(r."email")) ORDER BY r."createdAt", r."id") = 1
           THEN lower(btrim(r."email"))
         ELSE lower(r."id") || '@users.societyops.invalid'
       END,
       false,
       r."phone",
       true,
       r."createdAt",
       CURRENT_TIMESTAMP
FROM "ResidentProfile" r
WHERE r."id" IN (SELECT DISTINCT user_id FROM resident_user_map);

-- Existing bcrypt hashes carry over; src/auth/auth.ts verifies with bcrypt.
INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
SELECT 'acc_' || m.user_id,
       m.user_id,
       'credential',
       m.user_id,
       (SELECT p."hash" FROM "ResidentPassword" p WHERE p."residentId" = m.user_id ORDER BY p."createdAt" DESC LIMIT 1),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT user_id FROM resident_user_map) m;

-- Roles: admin -> society_admin, maintenance -> manager, everything else -> resident.
INSERT INTO "Membership" ("id", "societyId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT DISTINCT ON (m.user_id, x.role)
       'mem_' || md5(m.user_id || x.role),
       'society-main',
       m.user_id,
       x.role,
       CASE WHEN r."deletedAt" IS NULL THEN 'active' ELSE 'removed' END,
       r."createdAt",
       CURRENT_TIMESTAMP
FROM "ResidentProfile" r
JOIN resident_user_map m ON m.resident_id = r."id"
CROSS JOIN LATERAL (
  SELECT CASE r."role" WHEN 'admin' THEN 'society_admin' WHEN 'maintenance' THEN 'manager' ELSE 'resident' END AS role
) x
ORDER BY m.user_id, x.role, (r."deletedAt" IS NULL) DESC;

-- ---------------------------------------------------------------------------
-- Flats. Residents' flat numbers always become flats; ticket locations only
-- when they look like a flat ("B-402"), not a place ("Tower B"). "B-402" also
-- yields tower "B", floor 4.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE flat_source AS
SELECT DISTINCT
       CASE WHEN n ~ '^[A-Za-z0-9]+-[0-9]+$' THEN upper(n) ELSE n END AS "number"
FROM (
  SELECT btrim("flatNumber") AS n FROM "ResidentProfile" WHERE "role" = 'resident'
  UNION
  SELECT btrim("flatNumber") FROM "Ticket" WHERE btrim("flatNumber") ~ '^[A-Za-z0-9]+-[0-9]+$'
) s
WHERE n <> '';

INSERT INTO "Tower" ("id", "societyId", "name", "kind", "updatedAt")
SELECT 'twr_' || md5(t.name), 'society-main', t.name, 'tower', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT substring("number" FROM '^([A-Za-z0-9]+)-[0-9]+$') AS name FROM flat_source
) t
WHERE t.name IS NOT NULL;

INSERT INTO "Flat" ("id", "societyId", "towerId", "number", "floor", "updatedAt")
SELECT 'flt_' || md5(f."number"),
       'society-main',
       tw."id",
       f."number",
       CASE WHEN f."number" ~ '^[A-Za-z0-9]+-[0-9]{3,}$'
            THEN substring(f."number" FROM '-([0-9]+)$')::int / 100 END,
       CURRENT_TIMESTAMP
FROM flat_source f
LEFT JOIN "Tower" tw
  ON tw."societyId" = 'society-main' AND tw."name" = substring(f."number" FROM '^([A-Za-z0-9]+)-[0-9]+$');

INSERT INTO "FlatOccupant" ("id", "societyId", "flatId", "userId", "type", "status", "moveInDate", "createdAt", "updatedAt")
SELECT DISTINCT ON (fl."id", m.user_id)
       'occ_' || md5(fl."id" || m.user_id),
       'society-main',
       fl."id",
       m.user_id,
       'owner',
       CASE WHEN r."deletedAt" IS NULL THEN 'active' ELSE 'ended' END,
       r."createdAt",
       r."createdAt",
       CURRENT_TIMESTAMP
FROM "ResidentProfile" r
JOIN resident_user_map m ON m.resident_id = r."id"
JOIN "Flat" fl ON fl."societyId" = 'society-main' AND upper(fl."number") = upper(btrim(r."flatNumber"))
WHERE r."role" = 'resident'
ORDER BY fl."id", m.user_id, (r."deletedAt" IS NULL) DESC;

-- Point existing rows at the merged users and at the new flats.
UPDATE "Ticket" t SET "residentId" = m.user_id FROM resident_user_map m WHERE t."residentId" = m.resident_id;
UPDATE "ChatMessage" c SET "residentId" = m.user_id FROM resident_user_map m WHERE c."residentId" = m.resident_id;
UPDATE "Ticket" t SET "flatId" = f."id"
FROM "Flat" f
WHERE f."societyId" = t."societyId" AND upper(f."number") = upper(btrim(t."flatNumber"));

-- ---------------------------------------------------------------------------
-- Retire the old identity tables.
-- ---------------------------------------------------------------------------

ALTER TABLE "ResidentPassword" DROP CONSTRAINT "ResidentPassword_residentId_fkey";
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_residentId_fkey";
DROP TABLE "ResidentPassword";
DROP TABLE "ResidentProfile";

-- ---------------------------------------------------------------------------
-- Indexes and foreign keys
-- ---------------------------------------------------------------------------

DROP INDEX "ChatMessage_residentId_createdAt_idx";
DROP INDEX "Ticket_flatNumber_idx";
DROP INDEX "Ticket_status_idx";
DROP INDEX "Vendor_category_idx";

CREATE UNIQUE INDEX "Society_joinCode_key" ON "Society"("joinCode");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_societyId_userId_role_key" ON "Membership"("societyId", "userId", "role");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE UNIQUE INDEX "Tower_societyId_name_key" ON "Tower"("societyId", "name");
CREATE INDEX "Flat_towerId_idx" ON "Flat"("towerId");
CREATE UNIQUE INDEX "Flat_societyId_number_key" ON "Flat"("societyId", "number");
CREATE INDEX "FlatOccupant_flatId_idx" ON "FlatOccupant"("flatId");
CREATE INDEX "FlatOccupant_userId_idx" ON "FlatOccupant"("userId");
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");
CREATE INDEX "Invite_societyId_phone_idx" ON "Invite"("societyId", "phone");
CREATE INDEX "AgentActivityLog_societyId_idx" ON "AgentActivityLog"("societyId");
CREATE INDEX "ChatMessage_societyId_residentId_createdAt_idx" ON "ChatMessage"("societyId", "residentId", "createdAt");
CREATE INDEX "NotificationLog_societyId_idx" ON "NotificationLog"("societyId");
CREATE UNIQUE INDEX "SocietyProfile_societyId_key" ON "SocietyProfile"("societyId");
CREATE INDEX "Ticket_societyId_status_idx" ON "Ticket"("societyId", "status");
CREATE INDEX "Ticket_flatId_idx" ON "Ticket"("flatId");
CREATE INDEX "Ticket_commonAreaId_idx" ON "Ticket"("commonAreaId");
CREATE INDEX "Ticket_assetId_idx" ON "Ticket"("assetId");
CREATE INDEX "Vendor_societyId_category_idx" ON "Vendor"("societyId", "category");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tower" ADD CONSTRAINT "Tower_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlatOccupant" ADD CONSTRAINT "FlatOccupant_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlatOccupant" ADD CONSTRAINT "FlatOccupant_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlatOccupant" ADD CONSTRAINT "FlatOccupant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommonArea" ADD CONSTRAINT "CommonArea_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommonArea" ADD CONSTRAINT "CommonArea_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_amcVendorId_fkey" FOREIGN KEY ("amcVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyProfile" ADD CONSTRAINT "SocietyProfile_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentActivityLog" ADD CONSTRAINT "AgentActivityLog_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
