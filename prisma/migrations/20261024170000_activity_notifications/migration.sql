CREATE TABLE "Notification" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "eventKey" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
 "message" TEXT NOT NULL, "href" TEXT NOT NULL, "readAt" TIMESTAMP(3),
 "emailStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("emailStatus" IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Notification_userId_eventKey_key" ON "Notification"("userId","eventKey");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId","createdAt");
CREATE INDEX "Notification_emailStatus_createdAt_idx" ON "Notification"("emailStatus","createdAt");
