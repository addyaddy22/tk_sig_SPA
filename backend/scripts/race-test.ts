/**
 * Double-booking stress test against a running API (seeded database).
 *
 *   npm run test:race -- [http://localhost:3000/api]
 *
 * 1. Registers N throwaway clients.
 * 2. All N try to book the SAME therapist at the SAME time, simultaneously.
 *    → exactly 1 must succeed, N-1 must get 409 with alternatives.
 * 3. The rest try "any therapist" at that time → successes must equal the number of free therapists.
 * 4. Same client books two overlapping treatments → second is refused (CLIENT_OVERLAP).
 * 5. Cancelling frees the slot again.
 */
import { ApiClient, apiBaseFromArgs, Booking, codeOf, DayAvailability, required, runScript, Service, Slot } from './api-client';

const N = 12;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('✗ FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
}

runScript(async () => {
  const api = new ApiClient(apiBaseFromArgs());
  const run = Date.now().toString(36);

  const tokens = await Promise.all(
    Array.from({ length: N }, (_, i) => api.register(`Race ${i}`, `race-${run}-${i}@test.local`)),
  );
  assert(tokens.every(Boolean), `registered ${N} clients`);

  const services = await api.must<Service[]>('/services');
  const massage = required(services.find((s) => s.name.startsWith('Swedish')) ?? services[0], 'a massage service');

  // Find a day + slot with at least 2 free therapists.
  let found: { day: DayAvailability; slot: Slot } | undefined;
  for (let i = 1; i < 30 && !found; i++) {
    const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
    const d = await api.availability({ serviceId: massage.id, date });
    const s = d.slots.find((x) => x.therapistIds.length >= 2);
    if (s) found = { day: d, slot: s };
  }
  assert(found, 'found a slot with at least 2 free therapists');
  const { day, slot } = found;
  console.log(`  ${day.date}, ${massage.name}, ${slot.therapistIds.length} therapists free`);

  // --- 1. Same therapist, same time, N parallel requests
  const target = slot.therapistIds[0];
  const results = await Promise.all(
    tokens.map((token) => api.book(token, { serviceId: massage.id, startAt: slot.start, therapistId: target })),
  );
  const winners = results.flatMap((r, i) => (r.ok ? [{ booking: r.data, token: tokens[i] }] : []));
  const conflicts = results.flatMap((r) => (!r.ok && r.status === 409 ? [r.error] : []));
  assert(winners.length === 1, `specific therapist: exactly 1 of ${N} simultaneous requests succeeded (got ${winners.length})`);
  assert(conflicts.length === N - 1, `the other ${N - 1} got 409 Conflict`);
  assert(
    conflicts.every((c) => c.alternatives && c.message.includes('already booked')),
    `conflicts explain why: "${conflicts[0].message}"`,
  );
  const alt = required(conflicts[0].alternatives, 'alternatives');
  assert(
    alt.freeTherapistsAtRequestedTime.length >= 1 && !alt.freeTherapistsAtRequestedTime.some((t) => t.id === target),
    `alternatives offer other free therapists at that time: ${alt.freeTherapistsAtRequestedTime.map((t) => t.name).join(', ')}`,
  );
  const [winner] = winners;

  // --- 2. "Any therapist" at the same time: fills the remaining therapists, never more
  const remaining = slot.therapistIds.length - 1;
  const anyResults = await Promise.all(
    tokens.filter((t) => t !== winner.token).map((token) => api.book(token, { serviceId: massage.id, startAt: slot.start })),
  );
  const anyBooked: Booking[] = anyResults.flatMap((r) => (r.ok ? [r.data] : []));
  assert(anyBooked.length === remaining, `"any therapist": ${anyBooked.length} bookings = ${remaining} remaining free therapists`);
  const assigned = new Set([target, ...anyBooked.map((b) => b.therapist.id)]);
  assert(assigned.size === slot.therapistIds.length, 'every booking went to a different therapist');

  // --- 3. The availability endpoint now shows that time as full
  const after = await api.availability({ serviceId: massage.id, date: day.date });
  assert(!after.slots.some((s) => s.start === slot.start), 'the slot no longer appears in availability');

  // --- 4. A client can't be in two places at once
  const other = required(services.find((s) => s.category === 'Nails') ?? services[1], 'a second service');
  const overlap = await api.book(winner.token, { serviceId: other.id, startAt: slot.start });
  assert(codeOf(overlap) === 'CLIENT_OVERLAP', `same client, overlapping time → ${codeOf(overlap)}`);

  // --- 5. Cancelling frees the slot again
  await api.cancel(winner.token, winner.booking.id);
  const late = await api.register('Race late', `race-${run}-late@test.local`);
  const rebook = await api.book(late, { serviceId: massage.id, startAt: slot.start, therapistId: target });
  assert(rebook.ok, 'after cancellation the therapist can be booked again');

  console.log('\nAll double-booking checks passed.');
});
