import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { PlaceModel } from './model/place.model';
import { Model } from 'mongoose';

@Injectable()
export class PlaceService {
  constructor(@InjectModel(PlaceModel) private placeModle: Model<PlaceModel>) {}

  async findAll() {
    return await this.placeModle.find().exec();
  }

  async addOne(createPlace: PlaceModel) {
    // 创建一个place
    return await this.placeModle.create(createPlace);
  }
}
