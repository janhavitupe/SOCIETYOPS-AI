-- What a vendor reports when they finish a job, and who turned a job down.
ALTER TABLE "Ticket" ADD COLUMN "workNote" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "workImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Ticket" ADD COLUMN "declinedVendorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
