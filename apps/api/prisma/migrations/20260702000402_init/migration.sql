-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'lite',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "naverCustomerId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accessLicenseEncrypted" TEXT NOT NULL,
    "secretKeyEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "naverCampaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dailyBudget" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGroup" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "naverAdgroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deviceStrategy" TEXT,
    "regionStrategy" TEXT,
    "baseBid" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "naverKeywordId" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "currentBid" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "qualityScore" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiddingRule" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "targetRank" INTEGER NOT NULL,
    "rankUpperBound" INTEGER NOT NULL,
    "rankLowerBound" INTEGER NOT NULL,
    "minBid" INTEGER NOT NULL,
    "maxBid" INTEGER NOT NULL,
    "baseStep" INTEGER NOT NULL DEFAULT 100,
    "device" TEXT NOT NULL DEFAULT 'MOBILE',
    "region" TEXT,
    "schedule" JSONB,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adType" TEXT NOT NULL DEFAULT 'POWERLINK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiddingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiddingState" (
    "id" TEXT NOT NULL,
    "biddingRuleId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'SEARCHING',
    "lastCheckedAt" TIMESTAMP(3),
    "lastBidChangedAt" TIMESTAMP(3),
    "stableBid" INTEGER,
    "stableCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessRank" INTEGER,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "noRankChangeCount" INTEGER NOT NULL DEFAULT 0,
    "cooldownUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiddingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankCheck" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "biddingRuleId" TEXT NOT NULL,
    "checkedKeyword" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "region" TEXT,
    "rank" INTEGER,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidChange" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "biddingRuleId" TEXT NOT NULL,
    "beforeBid" INTEGER NOT NULL,
    "afterBid" INTEGER NOT NULL,
    "beforeRank" INTEGER,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "apiResult" TEXT,
    "apiSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BiddingState_biddingRuleId_key" ON "BiddingState"("biddingRuleId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGroup" ADD CONSTRAINT "AdGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiddingRule" ADD CONSTRAINT "BiddingRule_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiddingState" ADD CONSTRAINT "BiddingState_biddingRuleId_fkey" FOREIGN KEY ("biddingRuleId") REFERENCES "BiddingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankCheck" ADD CONSTRAINT "RankCheck_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankCheck" ADD CONSTRAINT "RankCheck_biddingRuleId_fkey" FOREIGN KEY ("biddingRuleId") REFERENCES "BiddingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidChange" ADD CONSTRAINT "BidChange_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidChange" ADD CONSTRAINT "BidChange_biddingRuleId_fkey" FOREIGN KEY ("biddingRuleId") REFERENCES "BiddingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
