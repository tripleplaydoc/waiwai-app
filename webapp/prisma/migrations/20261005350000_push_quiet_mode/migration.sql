-- Quiet mode: pause reminders for a while. New table only.
CREATE TABLE "push_prefs" (
    "userId" TEXT NOT NULL,
    "pausedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_prefs_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "push_prefs" ADD CONSTRAINT "push_prefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_prefs" ENABLE ROW LEVEL SECURITY;
