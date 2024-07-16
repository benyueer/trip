import { Logger, MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypegooseModule } from 'nestjs-typegoose';
import { PlaceModule } from './domains/place/place.module';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlanModule } from './domains/plan/plan.module';

@Module({
  imports: [

    TypegooseModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        Logger.debug(
          `connecting ${config.get('mongo_uri')}`,
          TypegooseModule.name,
        );
        return {
          uri: config.get('mongo_uri'),
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useCreateIndex: true,
          useFindAndModify: false,
        };
      },
      inject: [ConfigService],
    }),
    PlaceModule,
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      cache: true,
      isGlobal: true,
    }),
    PlanModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
