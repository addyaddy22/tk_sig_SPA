import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators';
import { settings } from './common/settings';

@ApiTags('System')
@Public()
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Public business settings the frontend needs (timezone, currency, slot size...). */
  @Get('config')
  config() {
    const s = settings();
    return {
      businessName: s.businessName,
      timezone: s.timezone,
      currency: s.currency,
      slotStepMin: s.slotStepMin,
      minLeadMin: s.minLeadMin,
      horizonDays: s.horizonDays,
    };
  }
}
