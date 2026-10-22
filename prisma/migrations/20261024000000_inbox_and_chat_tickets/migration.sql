-- A chat reply remembers the ticket it created, so history can show it again.
ALTER TABLE "ChatMessage" ADD COLUMN "ticketId" TEXT;

-- Notifications know who they were for, and when that person read them in the app.
ALTER TABLE "NotificationLog" ADD COLUMN "recipientUserId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "NotificationLog_recipientUserId_timestamp_idx" ON "NotificationLog"("recipientUserId", "timestamp");
