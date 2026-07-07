import { IsString, IsInt, IsOptional, IsBoolean, Min } from 'class-validator'

export class CreateBiddingRuleDto {
  @IsString()
  keywordId: string

  @IsInt() @Min(1)
  targetRank: number

  @IsOptional() @IsInt() @Min(1)
  rankUpperBound?: number

  @IsOptional() @IsInt() @Min(1)
  rankLowerBound?: number

  @IsInt() @Min(10)
  minBid: number

  @IsOptional() @IsInt() @Min(10)
  maxBid?: number

  @IsInt() @Min(10)
  baseStep: number

  @IsString()
  device: string

  @IsOptional() @IsString()
  region?: string

  @IsOptional() @IsInt()
  cooldownMinutes?: number

  @IsOptional() @IsBoolean()
  isActive?: boolean

  @IsOptional() @IsString()
  siteUrl?: string
}
