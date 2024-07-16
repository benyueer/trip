import { Module } from '@nestjs/common';
import { PlaceController } from './place.controller';
import { PlaceService } from './place.service';
import { TypegooseModule } from 'nestjs-typegoose';
import { PlaceModel } from './model/place.model';

@Module({
  imports: [
    TypegooseModule.forFeature([
      {
        typegooseClass: PlaceModel,
      },
    ]),
  ],
  controllers: [PlaceController],
  providers: [PlaceService],
})
export class PlaceModule {}
