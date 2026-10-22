-- Messages that are not about a ticket, such as asking a resident onto the app.
ALTER TABLE "NotificationLog" ALTER COLUMN "ticketId" DROP NOT NULL;

-- When a manager last asked a resident onto the app, so nobody is texted twice in a day.
ALTER TABLE "Membership" ADD COLUMN "lastInvitedAt" TIMESTAMP(3);
