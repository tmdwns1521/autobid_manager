import { IsString, IsNotEmpty } from 'class-validator'

export class CreateAdAccountDto {
  @IsString()
  @IsNotEmpty()
  accountName: string

  @IsString()
  @IsNotEmpty()
  naverCustomerId: string

  @IsString()
  @IsNotEmpty()
  accessLicense: string

  @IsString()
  @IsNotEmpty()
  secretKey: string
}
