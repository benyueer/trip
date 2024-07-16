import { ApiProperty } from '@nestjs/swagger';
import { ObjectId } from 'mongoose';

export class CreatePlanDto {
  @ApiProperty({ example: 'Basic Plan' })
  name: string;

  @ApiProperty({ example: 'This is a basic plan' })
  description: string;

  @ApiProperty({ example: '100' })
  duration: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [String] })
  days: string[];
}
