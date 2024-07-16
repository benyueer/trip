import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';
import { TypegooseModule } from 'nestjs-typegoose';
import { Day, Milestone, Plan } from './entities/plan.entity';

@Module({
  imports: [TypegooseModule.forFeature([Plan, Milestone, Day])],
  controllers: [PlanController],
  providers: [PlanService],
})
export class PlanModule {}
