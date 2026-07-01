import { Module } from '@nestjs/common'
import { NaverApiClient } from './naver-api.client'

@Module({
  providers: [NaverApiClient],
  exports: [NaverApiClient],
})
export class NaverModule {}
