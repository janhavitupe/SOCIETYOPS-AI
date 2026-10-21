-- Vendors sign in to see and update their own jobs. Each vendor is linked to
-- the user with the same phone (created when there is none), who holds a
-- 'worker' membership in the vendor's society.

ALTER TABLE "Vendor" ADD COLUMN "userId" TEXT;
CREATE INDEX "Vendor_userId_idx" ON "Vendor"("userId");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phones in the canonical form users have (+<country><number>), as
-- src/services/phone.ts produces, so vendors and users match.
UPDATE "Vendor" AS v
SET phone = CASE
  WHEN length(d.digits) = 11 AND left(d.digits, 1) = '0' THEN '+91' || substr(d.digits, 2)
  WHEN length(d.digits) = 10 THEN '+91' || d.digits
  WHEN length(d.digits) BETWEEN 11 AND 15 THEN '+' || d.digits
  ELSE v.phone
END
FROM (SELECT id, regexp_replace(phone, '[^0-9]', '', 'g') AS digits FROM "Vendor") AS d
WHERE d.id = v.id;

-- An account for each vendor phone that has none. One phone is one person,
-- even when they work for vendors in several societies.
INSERT INTO "User" ("id", "name", "email", "emailVerified", "phoneNumber", "phoneNumberVerified", "createdAt", "updatedAt")
SELECT DISTINCT ON (v.phone)
       gen_random_uuid()::text,
       v.name,
       regexp_replace(v.phone, '[^0-9]', '', 'g') || '@users.societyops.invalid',
       false,
       v.phone,
       false,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Vendor" v
WHERE v."deletedAt" IS NULL
  AND v.phone ~ '^\+[0-9]{11,15}$'
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."phoneNumber" = v.phone)
ORDER BY v.phone, v."createdAt";

UPDATE "Vendor" v SET "userId" = u.id
FROM "User" u
WHERE u."phoneNumber" = v.phone AND v."deletedAt" IS NULL;

INSERT INTO "Membership" ("id", "societyId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT DISTINCT ON (v."societyId", v."userId")
       gen_random_uuid()::text, v."societyId", v."userId", 'worker', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vendor" v
WHERE v."userId" IS NOT NULL AND v."deletedAt" IS NULL
ON CONFLICT ("societyId", "userId", "role") DO NOTHING;
