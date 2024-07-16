import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { Crud } from 'nestjs-mongoose-crud';
import { PlaceModel } from './model/place.model';
import { InjectModel } from 'nestjs-typegoose';
import { ModelType } from '@typegoose/typegoose/lib/types';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

@Crud({
  model: PlaceModel,
  routes: {
    find: false,
  },
})
@ApiTags('Place')
@Controller('place')
export class PlaceController {
  constructor(@InjectModel(PlaceModel) public model: ModelType<PlaceModel>) {}

  @Get()
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'province', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  async findAll(
    @Query('name') name: string,
    @Query('province') province: string,
    @Query('city') city: string,
    @Query('limit') limit: number = 10,
    @Query('page') page: number = 1,
  ) {
    const query = {};
    if (name) query['name'] = { $regex: name };
    if (province) query['province'] = { $regex: province };
    if (city) query['city'] = { $regex: city };
    const data = await this.model
      .find(query)
      .limit(limit)
      .skip(limit * (page - 1));
    const total = await this.model.countDocuments(query);
    return { data, total };
  }

  @Delete(':id')
  async deleteOne(@Param('id') id: string) {
    return await this.model.findOneAndDelete({ _id: id });
  }
}
