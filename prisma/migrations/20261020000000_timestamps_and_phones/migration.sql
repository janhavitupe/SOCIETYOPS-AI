-- Timestamps were stored as ISO strings in text columns, so they could not be
-- sorted or filtered as dates. Convert them in place, keeping existing values.
--
-- A value that does not parse becomes NULL (or now() on NOT NULL columns)
-- rather than failing the whole migration.
CREATE FUNCTION "_societyops_parse_ts"(v text) RETURNS timestamp(3) AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;
  RETURN (v::timestamptz AT TIME ZONE 'UTC');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "TimelineEvent"
  ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3)
    USING COALESCE("_societyops_parse_ts"("timestamp"), CURRENT_TIMESTAMP),
  ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Ticket"
  ALTER COLUMN "lastFollowupAt" SET DATA TYPE TIMESTAMP(3)
    USING "_societyops_parse_ts"("lastFollowupAt");

ALTER TABLE "NotificationLog"
  ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3)
    USING COALESCE("_societyops_parse_ts"("timestamp"), CURRENT_TIMESTAMP),
  ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AgentActivityLog"
  ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3)
    USING COALESCE("_societyops_parse_ts"("timestamp"), CURRENT_TIMESTAMP),
  ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SocietyProfile"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3)
    USING COALESCE("_societyops_parse_ts"("updatedAt"), CURRENT_TIMESTAMP);

ALTER TABLE "ResidentProfile"
  ALTER COLUMN "lastActiveAt" SET DATA TYPE TIMESTAMP(3)
    USING "_societyops_parse_ts"("lastActiveAt"),
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3)
    USING COALESCE("_societyops_parse_ts"("createdAt"), CURRENT_TIMESTAMP),
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

DROP FUNCTION "_societyops_parse_ts"(text);

-- Store resident phones in one canonical form (+<country><number>), the same
-- form src/services/phone.ts produces, so the (flatNumber, phone) unique
-- constraint catches "+91 98210 99887" and "9821099887" as the same person.
-- Registration and login previously loaded every resident to compare
-- normalised numbers in memory.
UPDATE "ResidentProfile" AS r
SET phone = CASE
  WHEN length(d.digits) = 11 AND left(d.digits, 1) = '0' THEN '+91' || substr(d.digits, 2)
  WHEN length(d.digits) = 10 THEN '+91' || d.digits
  WHEN length(d.digits) BETWEEN 11 AND 15 THEN '+' || d.digits
  ELSE r.phone
END
FROM (
  SELECT id, regexp_replace(phone, '[^0-9]', '', 'g') AS digits FROM "ResidentProfile"
) AS d
WHERE d.id = r.id;
