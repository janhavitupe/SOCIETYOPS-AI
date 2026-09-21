-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "flatNumber" TEXT NOT NULL,
    "residentName" TEXT NOT NULL,
    "residentPhone" TEXT NOT NULL,
    "issueCategory" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedVendorId" TEXT,
    "assignedVendorName" TEXT,
    "assignedVendorPhone" TEXT,
    "estimatedEta" TEXT,
    "images" TEXT[],
    "societyName" TEXT NOT NULL,
    "lastFollowupAt" TEXT,
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "residentId" TEXT,
    "vendorId" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "availability" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "avgResolutionTime" TEXT NOT NULL,
    "completedJobs" INTEGER NOT NULL,
    "activeJobsCount" INTEGER NOT NULL DEFAULT 0,
    "skills" TEXT[],
    "societyName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentActivityLog" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "ticketId" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AgentActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyProfile" (
    "id" TEXT NOT NULL,
    "societyName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "introText" TEXT NOT NULL,
    "maintenanceContact" TEXT NOT NULL,
    "maintenancePhone" TEXT NOT NULL,
    "maintenanceEmail" TEXT NOT NULL,
    "highlights" TEXT[],
    "lastUpdatedBy" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "SocietyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flatNumber" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "accessToken" TEXT NOT NULL,
    "tokensGenerated" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ResidentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentPassword" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentPassword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_flatNumber_idx" ON "Ticket"("flatNumber");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_residentId_idx" ON "Ticket"("residentId");

-- CreateIndex
CREATE INDEX "Ticket_vendorId_idx" ON "Ticket"("vendorId");

-- CreateIndex
CREATE INDEX "TimelineEvent_ticketId_idx" ON "TimelineEvent"("ticketId");

-- CreateIndex
CREATE INDEX "Vendor_category_idx" ON "Vendor"("category");

-- CreateIndex
CREATE INDEX "NotificationLog_ticketId_idx" ON "NotificationLog"("ticketId");

-- CreateIndex
CREATE INDEX "AgentActivityLog_ticketId_idx" ON "AgentActivityLog"("ticketId");

-- CreateIndex
CREATE INDEX "ResidentProfile_flatNumber_idx" ON "ResidentProfile"("flatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentProfile_flatNumber_phone_key" ON "ResidentProfile"("flatNumber", "phone");

-- CreateIndex
CREATE INDEX "ResidentPassword_residentId_idx" ON "ResidentPassword"("residentId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "ResidentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActivityLog" ADD CONSTRAINT "AgentActivityLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentPassword" ADD CONSTRAINT "ResidentPassword_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "ResidentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

