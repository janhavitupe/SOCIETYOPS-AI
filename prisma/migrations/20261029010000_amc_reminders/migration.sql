-- AMC expiry reminders already sent, so each goes out once.
ALTER TABLE "Asset" ADD COLUMN "amcReminded" TEXT[] DEFAULT ARRAY[]::TEXT[];
