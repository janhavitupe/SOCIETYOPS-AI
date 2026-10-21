-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "residentFeedback" TEXT,
ADD COLUMN     "residentRating" INTEGER,
ADD COLUMN     "slaDueAt" TIMESTAMP(3);

