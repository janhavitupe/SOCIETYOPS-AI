-- People who reported a common-area problem that was already open.
ALTER TABLE "Ticket" ADD COLUMN "alsoReportedBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Ticket_alsoReportedBy_idx" ON "Ticket" USING GIN ("alsoReportedBy");
