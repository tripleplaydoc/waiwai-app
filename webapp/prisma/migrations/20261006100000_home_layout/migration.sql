-- Home screen layout: which sections show and in what order, per person. New table only.
CREATE TABLE "home_layouts" (
    "userId" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "home_layouts_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "home_layouts" ADD CONSTRAINT "home_layouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "home_layouts" ENABLE ROW LEVEL SECURITY;
