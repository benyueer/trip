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
    PlaceModule,
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: false,
      cache: true,
      isGlobal: true,
    }),
    TypegooseModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        Logger.debug(
          `connecting ${config.get('MONGO_URI')}`,
          TypegooseModule.name,
        );
        return {
          uri: config.get('MONGO_URI'),
          // useNewUrlParser: true,
          // useUnifiedTopology: true,
          // useCreateIndex: true,
          // useFindAndModify: false,
        };
      },
      inject: [ConfigService],
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
