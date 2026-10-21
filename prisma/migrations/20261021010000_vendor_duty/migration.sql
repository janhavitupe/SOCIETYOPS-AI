-- A vendor's "busy" state is now worked out from their open tickets, so the
-- stored availability only says whether they are on duty at all:
-- 'Available' (on duty) or 'Offline'. The hand-set 'On Job' value was never
-- updated when jobs came and went; those vendors are on duty.
UPDATE "Vendor" SET "availability" = 'Available' WHERE "availability" = 'On Job';
