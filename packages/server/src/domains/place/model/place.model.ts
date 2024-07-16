import { prop } from '@typegoose/typegoose';
import { ApiProperty } from '@nestjs/swagger';
import { BasicModel } from 'src/dto/basic.model';

export enum PlaceType {
  // 景点
  SCENERY = 'scenery',
  // 酒店
  HOTEL = 'hotel',
  // 餐馆
  RESTAURANT = 'restaurant',
  // 购物
  SHOPPING = 'shopping',
  // 停车场
  PARKING = 'parking',
  // 标记点
  MARKER = 'marker',
}

export class PlaceModel extends BasicModel {
  @ApiProperty()
  @prop({})
  name: string;

  @ApiProperty()
  @prop({})
  sname: string;

  @ApiProperty()
  @prop({})
  description: string;

  @ApiProperty()
  @prop({})
  province: string;

  @ApiProperty()
  @prop({})
  city: string;

  @ApiProperty()
  @prop({})
  lng: number;

  @ApiProperty()
  @prop({})
  lat: number;

  @ApiProperty()
  @prop({})
  touchCount: number;

  @ApiProperty()
  @prop({})
  type: PlaceType;

  @ApiProperty()
  @prop()
  appraisal: string[];

  @ApiProperty()
  @prop()
  level: number;

  @ApiProperty()
  @prop()
  images: string[];
}
