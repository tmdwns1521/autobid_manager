-- AlterTable: BiddingState에 이진 탐색 범위 필드 추가
ALTER TABLE "BiddingState" ADD COLUMN "searchLow" INTEGER;
ALTER TABLE "BiddingState" ADD COLUMN "searchHigh" INTEGER;
