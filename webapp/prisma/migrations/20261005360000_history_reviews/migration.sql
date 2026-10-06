-- Year review: remembers which past years you have gone through line by line. New table only.
CREATE TABLE "history_reviews" (
    "workspaceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "history_reviews_pkey" PRIMARY KEY ("workspaceId","year")
);
ALTER TABLE "history_reviews" ADD CONSTRAINT "history_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "history_reviews" ENABLE ROW LEVEL SECURITY;
