import { Prisma } from '@prisma/client';

/**
 * Collision prevention is a core business rule, so every write that changes "who is
 * available when" runs inside a transaction holding this lock:
 *   - creating / rescheduling bookings
 *   - adding time off (leave, breaks)
 *   - changing working hours or therapist skills
 *
 * The lock serializes those writes, so a rule check and the write that follows it can never
 * interleave with another request (no check-then-act race). It is transaction-scoped and
 * released automatically on commit or rollback. A spa makes a handful of these writes per
 * minute, so serializing them costs nothing.
 *
 * The PostgreSQL exclusion constraints remain as the final safety net underneath this.
 */
const SCHEDULE_LOCK_KEY = 7_413_001;

export async function lockSchedule(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`);
}
