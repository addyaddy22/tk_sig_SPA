import { BookingStatus } from '@prisma/client';

/** Statuses that occupy a therapist's time. Must match the WHERE clause of the DB exclusion constraints. */
export const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
