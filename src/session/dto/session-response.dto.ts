import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({example: 'Computer'})
  device!: string;

  @ApiProperty({example: 'Chrome'})
  browser!: string;

  @ApiPropertyOptional({example: 'Mumbai, MH, IN'})
  location?: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;
}
