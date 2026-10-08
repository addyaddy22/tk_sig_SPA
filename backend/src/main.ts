import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { settings } from './common/settings';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = settings();

  // Swagger UI serves its own scripts/styles; keep helmet's strict CSP for the real API.
  const secure = helmet();
  app.use((req: any, res: any, next: any) => (req.path.startsWith('/api/docs') ? next() : secure(req, res, next)));
  app.enableCors({ origin: cfg.corsOrigin, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  if (cfg.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle(`${cfg.businessName} API`)
      .setDescription(
        'Booking API with double-booking protection.\n\n' +
          '**Try it:** `POST /api/auth/login` with a demo login (password `Password123!`), copy `accessToken`, ' +
          'click **Authorize** and paste it. Demo users: admin@tksigspa.com, client@example.com, grace@tksigspa.com.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc), {
      jsonDocumentUrl: 'api/docs-json',
      customSiteTitle: `${cfg.businessName} API`,
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', docExpansion: 'none' },
    });
  }

  await app.listen(cfg.port);
  Logger.log(`${cfg.businessName} API running on http://localhost:${cfg.port}/api (tz ${cfg.timezone})`, 'Bootstrap');
  if (cfg.swaggerEnabled) Logger.log(`API docs: http://localhost:${cfg.port}/api/docs`, 'Bootstrap');
}
bootstrap();
