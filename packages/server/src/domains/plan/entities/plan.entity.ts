import { ApiProperty } from '@nestjs/swagger';
import { Ref, prop } from '@typegoose/typegoose';
import { PlaceModel } from 'src/domains/place/model/place.model';
import { BasicModel } from 'src/dto/basic.model';

export class Plan extends BasicModel {
  @ApiProperty()
  @prop()
  name: string;

  @ApiProperty()
  @prop()
  description: string;

  @ApiProperty()
  @prop()
  // 计划时长
  duration: string;

  @ApiProperty()
  @prop()
  tags: string[];

  @ApiProperty()
  @prop({ ref: () => Day })
  // 里程碑
  days: string[] | Ref<Day>[];
}

export class Day {
  @ApiProperty()
  _id: string;
  @ApiProperty()
  @prop()
  dayIndex: number;
  @ApiProperty({ type: () => [String] })
  @prop({ ref: () => Milestone })
  milestones: string[] | Ref<Milestone>[];
}

enum MilestoneType {
  // 路程-长途
  LONG_DISTANCE = 'LONG_DISTANCE',
  // 路程-短途
  SHORT_DISTANCE = 'SHORT_DISTANCE',
  // 休息-夜
  NIGHT_REST = 'NIGHT_REST',
  // 小憩
  SHORT_REST = 'SHORT_REST',
  // 吃饭
  EAT = 'EAT',
  // 游玩
  PLAY = 'PLAY',
}

enum MilestoneStatus {
  // 未开始
  NOT_STARTED = 'NOT_STARTED',
  // 进行中
  IN_PROGRESS = 'IN_PROGRESS',
  // 已完成
  FINISHED = 'FINISHED',
  // 已取消
  CANCELED = 'CANCELED',
}

export class Milestone {
  @ApiProperty()
  @prop()
  // 里程碑名称
  name: string;

  @ApiProperty()
  @prop()
  // 里程碑描述
  description: string;

  @ApiProperty()
  @prop()
  startAt: string;

  @ApiProperty()
  @prop()
  endAt: string;

  @ApiProperty()
  @prop({ ref: () => PlaceModel, required: false })
  startPoint?: string | Ref<PlaceModel>;

  @ApiProperty()
  @prop({ ref: () => PlaceModel, required: false })
  endPoint?: string | Ref<PlaceModel>;

  @ApiProperty()
  @prop({ ref: () => PlaceModel, required: false })
  place?: string | Ref<PlaceModel>;

  @ApiProperty()
  @prop({ required: false })
  // 里程碑状态
  status?: MilestoneStatus;

  @ApiProperty()
  @prop()
  // 里程碑类型
  type: MilestoneType;
}
