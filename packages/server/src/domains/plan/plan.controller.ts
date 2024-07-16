import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Crud } from 'nestjs-mongoose-crud';
import { Day, Milestone, Plan } from './entities/plan.entity';
import { InjectModel } from 'nestjs-typegoose';
import { ModelType } from '@typegoose/typegoose/lib/types';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ObjectId } from 'mongodb';

@Crud({
  model: Plan,
  routes: {
    find: false,
    findOne: false,
    // update: false,
  },
})
@ApiTags('Plan')
@Controller('plan')
export class PlanController {
  constructor(
    @InjectModel(Plan) private readonly planModel: ModelType<Plan>,
    @InjectModel(Day) private readonly dayModel: ModelType<Day>,
    @InjectModel(Milestone)
    private readonly milestioneModel: ModelType<Milestone>,
    private readonly planService: PlanService,
  ) {}

  @Get()
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'detail', required: false, example: false })
  async findAll(
    @Query('name') name: string,
    @Query('tag') tag: string,
    @Query('limit') limit = 10,
    @Query('page') page = 1,
    @Query('detail', {
      transform(value) {
        return value === 'true';
      },
    })
    detail: boolean = false,
  ) {
    const query = {};
    if (name) {
      query['name'] = { $regex: name, $options: 'i' };
    }
    if (tag) {
      query['tags'] = { $in: [tag] };
    }
    const total = await this.planModel.countDocuments(query);
    const dataQuery = this.planModel
      .find(query)
      .limit(limit)
      .skip((page - 1) * limit);

    const data = detail
      ? await dataQuery.populate('days').populate({
          path: 'days',
          populate: {
            path: 'milestones',
            populate: [
              { path: 'place' },
              { path: 'startPoint' },
              { path: 'endPoint' },
            ],
          },
        })
      : await dataQuery;

    return { data, total };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.planModel
      .findById(id)
      .populate('days')
      .populate({
        path: 'days',
        populate: {
          path: 'milestones',
          populate: [
            { path: 'place' },
            { path: 'startPoint' },
            { path: 'endPoint' },
          ],
        },
      });
  }

  @Post()
  async create(@Body() createPlanDto: CreatePlanDto) {
    console.log(createPlanDto);

    const plan = await this.planModel.create({
      ...createPlanDto,
    });

    return plan;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.planModel.findByIdAndDelete(id);
  }

  @Put()
  async update(@Body() updatePlanDto: UpdatePlanDto) {
    updatePlanDto.days = updatePlanDto.days.map(
      (day) => new ObjectId(day),
    ) as any;
    return await this.planModel.findByIdAndUpdate(
      updatePlanDto._id,
      updatePlanDto,
    );
  }

  @Post('day')
  async createDay(@Body() createDayDto: Day) {
    return await this.dayModel.create(createDayDto);
  }

  @Put('day')
  async updateDay(@Body() updateDayDto: Day) {
    return await this.dayModel.findByIdAndUpdate(
      updateDayDto._id,
      updateDayDto,
    );
  }

  @Delete('day/:planId/:dayId')
  async deleteDay(
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
  ) {
    const milestoneIds = await this.dayModel
      .findById(dayId)
      .select('milestones');
    await this.milestioneModel.deleteMany({
      _id: { $in: milestoneIds.milestones },
    });
    return await this.planModel.findByIdAndUpdate(planId, {
      $pull: { days: dayId },
    });
  }

  @Post('milestone')
  async createMilestone(@Body() createPlanDto: Milestone) {
    const milestone = await this.milestioneModel.create(createPlanDto);
    return this.milestioneModel
      .findById(milestone._id)
      .populate(['place', 'startPoint', 'endPoint']);
  }

  @Get('milestone')
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  async findAllMilestone(
    @Query('name') name: string = '',
    @Query('limit') limit = 10,
    @Query('page') page = 1,
  ) {
    const skip = (page - 1) * limit;
    const query = name ? { name: { $regex: name, $options: 'i' } } : {};
    const [data, total] = await Promise.all([
      this.milestioneModel.find(query).skip(skip).limit(limit),
      this.milestioneModel.countDocuments(query),
    ]);
    return { data, total };
  }

  @Delete('milestone/:dayId/:milestoneId')
  async deleteMilestone(
    @Param('dayId') dayId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    console.log(dayId, milestoneId);
    return await this.dayModel.findByIdAndUpdate(dayId, {
      $pull: { milestones: milestoneId },
    });
  }
}
