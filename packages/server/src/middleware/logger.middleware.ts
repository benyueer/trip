import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(
    @Inject(ConfigService)
    private config: ConfigService,
  ) {}

  use(request: Request, response: Response, next: NextFunction) {
    const { method, protocol, hostname, originalUrl } = request;
    const { statusCode } = response;
    const port = this.config.get('APP_PORT');

    Logger.log(
      `${method} ${protocol}://${hostname}:${port}${originalUrl} ${statusCode}`,
      LoggerMiddleware.name,
    );
    next();
  }
}
