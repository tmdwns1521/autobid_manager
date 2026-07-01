import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' })

  await app.listen(process.env.PORT || 4000)
  console.log(`API server running on port ${process.env.PORT || 4000}`)
}

bootstrap()
