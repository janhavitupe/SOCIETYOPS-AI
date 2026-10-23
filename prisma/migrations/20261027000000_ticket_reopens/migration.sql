-- How many times a resident sent a "fixed" ticket back as not fixed.
ALTER TABLE "Ticket" ADD COLUMN "reopenCount" INTEGER NOT NULL DEFAULT 0;
