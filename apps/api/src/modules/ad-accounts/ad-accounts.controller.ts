import { Controller, Get, Post, Delete, Param, Body, HttpCode } from '@nestjs/common'
import { AdAccountsService } from './ad-accounts.service'
import { CreateAdAccountDto } from './dto/create-ad-account.dto'

@Controller('ad-accounts')
export class AdAccountsController {
  constructor(private readonly service: AdAccountsService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Post()
  create(@Body() dto: CreateAdAccountDto) {
    return this.service.create(dto)
  }

  @Post(':id/sync')
  @HttpCode(200)
  sync(@Param('id') id: string) {
    return this.service.syncFromNaver(id)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
