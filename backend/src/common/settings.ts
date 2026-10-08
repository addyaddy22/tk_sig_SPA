/** Runtime settings, read lazily from the environment (ConfigModule loads .env). */
export function settings() {
  const int = (key: string, fallback: number) => {
    const v = parseInt(process.env[key] ?? '', 10);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    port: int('PORT', 3000),
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    businessName: process.env.BUSINESS_NAME ?? 'TK Signature Spa',
    timezone: process.env.SPA_TIMEZONE ?? 'Africa/Harare',
    currency: process.env.CURRENCY ?? 'USD',
    slotStepMin: int('SLOT_STEP_MIN', 15),
    minLeadMin: int('MIN_LEAD_MIN', 60),
    horizonDays: int('BOOKING_HORIZON_DAYS', 60),
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') !== 'false',
  };
}
