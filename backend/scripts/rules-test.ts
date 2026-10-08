/**
 * Booking-rules test against a running API with the seeded demo data.
 * Calls the API directly (no UI), proving the rules are enforced server-side.
 *
 *   npm run test:rules -- [http://localhost:3000/api]
 *
 * Seed facts used: Swedish Massage 60 min + 15 min cleanup is offered by Grace (Mon–Fri 09–13 & 14–18,
 * i.e. a daily lunch break) and Rudo (Tue–Sat 10–19). Deep Tissue (90 min) is Grace only.
 * Chipo is a nail technician and does not offer massage.
 */
import { ApiClient, apiBaseFromArgs, codeOf, required, runScript, Service, TherapistRef } from './api-client';

const TZ = 'Africa/Harare';
const TZ_OFFSET = '+02:00'; // Africa/Harare has no DST
const DAY_MS = 86_400_000;

let failed = 0;
function check(cond: boolean, msg: string) {
  console.log(cond ? '✓' : '✗ FAIL:', msg);
  if (!cond) failed++;
}
const section = (title: string) => console.log(`\n— ${title}`);

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const weekday = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const at = (day: string, time: string) => `${day}T${time}:00${TZ_OFFSET}`;

runScript(async () => {
  const api = new ApiClient(apiBaseFromArgs());
  const run = Date.now().toString(36);
  const admin = await api.login('admin@tksigspa.com');
  const client = await api.register('Rules Test', `rules-${run}@test.local`);

  const services = await api.must<Service[]>('/services');
  const svc = (prefix: string) => required(services.find((s) => s.name.startsWith(prefix)), `service "${prefix}"`);
  const swedish = svc('Swedish');
  const deep = svc('Deep Tissue');
  const therapists = await api.must<TherapistRef[]>('/therapists');
  const th = (prefix: string) => required(therapists.find((t) => t.name.startsWith(prefix)), `therapist "${prefix}"`);
  const [grace, rudo, chipo] = [th('Grace'), th('Rudo'), th('Chipo')];

  // A Tuesday 2+ weeks out (clear of other tests), plus the following Saturday, Sunday and Monday.
  let t = new Date(Date.now() + 15 * DAY_MS);
  while (weekday(t) !== 'Tue') t = new Date(t.getTime() + DAY_MS);
  const TUE = ymd(t);
  const SAT = ymd(new Date(t.getTime() + 4 * DAY_MS));
  const SUN = ymd(new Date(t.getTime() + 5 * DAY_MS));
  const MON = ymd(new Date(t.getTime() + 6 * DAY_MS));

  const cleanup: { bookings: string[]; timeOff: [therapistId: string, timeOffId: string][] } = { bookings: [], timeOff: [] };
  const runCleanup = async () => {
    for (const id of cleanup.bookings) await api.cancel(admin, id);
    for (const [tid, id] of cleanup.timeOff) await api.removeTimeOff(admin, tid, id);
    cleanup.bookings = [];
    cleanup.timeOff = [];
  };

  console.log(`Testing on Tuesday ${TUE}`);

  section('Skills: only therapists who offer the service');
  let r = await api.book(client, { serviceId: swedish.id, startAt: at(TUE, '10:00'), therapistId: chipo.id });
  check(codeOf(r) === 'NOT_QUALIFIED', `Chipo can't be booked for a massage → ${codeOf(r)}${r.ok ? '' : `: "${r.error.message}"`}`);
  check(
    !r.ok && !!r.error.alternatives?.freeTherapistsAtRequestedTime.some((x) => x.id === grace.id),
    '  …and qualified therapists free at 10:00 are offered instead',
  );

  section('Working hours & daily breaks: the ENTIRE treatment must fit in a shift');
  r = await api.book(client, { serviceId: swedish.id, startAt: at(TUE, '12:30'), therapistId: grace.id });
  check(codeOf(r) === 'OUTSIDE_WORKING_HOURS', `Grace 12:30–13:30 would run into her 13:00 lunch break → ${codeOf(r)}`);
  r = await api.book(client, { serviceId: swedish.id, startAt: at(SUN, '10:00'), therapistId: grace.id });
  check(codeOf(r) === 'OUTSIDE_WORKING_HOURS', `Grace on Sunday (day off) → ${codeOf(r)}`);

  section('Service duration drives availability');
  let day = await api.availability({ serviceId: deep.id, date: TUE, therapistId: grace.id });
  const deepStarts = day.slots.map((s) => hhmm(s.start));
  check(deepStarts.includes('11:30') && !deepStarts.includes('11:45'), '90-min Deep Tissue: last morning start is 11:30 (ends 13:00); 11:45 not offered');
  day = await api.availability({ serviceId: swedish.id, date: TUE, therapistId: grace.id });
  check(day.slots.some((s) => hhmm(s.start) === '12:00'), '60-min Swedish: 12:00 is offered (ends 13:00)');

  section('Leave / time off');
  const leave = await api.addTimeOff(admin, rudo.id, { startAt: at(TUE, '10:00'), endAt: at(TUE, '12:00'), reason: 'Rules test' });
  check(leave.ok, 'admin adds leave for Rudo 10:00–12:00');
  if (leave.ok) cleanup.timeOff.push([rudo.id, leave.data.id]);
  r = await api.book(client, { serviceId: swedish.id, startAt: at(TUE, '11:30'), therapistId: rudo.id });
  check(codeOf(r) === 'TIME_OFF', `Rudo 11:30 overlaps leave → ${codeOf(r)}`);
  day = await api.availability({ serviceId: swedish.id, date: TUE, therapistId: rudo.id });
  const firstRudo = day.slots[0] ? hhmm(day.slots[0].start) : 'none';
  check(firstRudo === '12:00', `therapist-first calendar for Rudo starts at 12:00 (got ${firstRudo})`);

  section('Time-first: who can do it, free for the whole period?');
  const atTime = await api.atTime(swedish.id, at(TUE, '10:30'));
  const names = atTime.therapists.map((x) => `${x.name.split(' ')[0]}:${x.free ? 'free' : x.reason}`).join(', ');
  check(atTime.therapists.every((x) => [grace.id, rudo.id].includes(x.id)), `only qualified therapists listed (${names})`);
  check(atTime.therapists.find((x) => x.id === grace.id)?.free === true, '  Grace is free');
  check(atTime.therapists.find((x) => x.id === rudo.id)?.reason === 'TIME_OFF', '  Rudo is shown as on leave');
  check(hhmm(atTime.requiredPeriod.blockedUntil) === '11:45', '  required period includes cleanup: 10:30 → 11:45');
  r = await api.book(client, { serviceId: swedish.id, startAt: at(TUE, '10:30') }); // "no preference"
  check(r.ok && r.data.therapist.id === grace.id, `"no preference" at 10:30 auto-assigns the only free therapist → ${r.ok ? r.data.therapist.name : codeOf(r)}`);
  if (r.ok) cleanup.bookings.push(r.data.id);

  section('Existing appointments (+ cleanup buffer)');
  r = await api.book(client, { serviceId: swedish.id, startAt: at(TUE, '12:00'), therapistId: rudo.id });
  check(r.ok, 'book Rudo 12:00–13:00 (blocked until 13:15)');
  if (r.ok) cleanup.bookings.push(r.data.id);
  const other = await api.register('Rules Other', `rules-${run}-b@test.local`);
  r = await api.book(other, { serviceId: swedish.id, startAt: at(TUE, '13:00'), therapistId: rudo.id });
  check(codeOf(r) === 'ALREADY_BOOKED', `another client at 13:00 (during Rudo's cleanup) → ${codeOf(r)}`);
  check(
    !r.ok && !!r.error.alternatives?.nearestSlots.some((s) => hhmm(s.start) === '13:15'),
    '  …nearest alternative with Rudo includes 13:15',
  );
  const overBooking = await api.addTimeOff(admin, rudo.id, { startAt: at(TUE, '12:00'), endAt: at(TUE, '12:30') });
  check(codeOf(overBooking) === 'TIME_OFF_HAS_BOOKINGS', `leave on top of a booking is flagged → ${codeOf(overBooking)}`);

  section('Therapist-first: next available day');
  day = await api.availability({ serviceId: deep.id, date: SAT, therapistId: grace.id });
  check(
    day.slots.length === 0 && day.nextAvailable?.date === MON,
    `Grace doesn't work Saturday → nextAvailable = Monday ${day.nextAvailable?.date}`,
  );

  await runCleanup();

  section('Leave and a booking for the same slot, submitted at the same moment');
  let clean = true;
  for (const [i, time] of ['15:00', '15:15', '15:30', '16:00', '16:30'].entries()) {
    const racer = await api.register(`Racer ${i}`, `rules-${run}-r${i}@test.local`);
    const [b, o] = await Promise.all([
      api.book(racer, { serviceId: swedish.id, startAt: at(MON, time), therapistId: grace.id }),
      api.addTimeOff(admin, grace.id, { startAt: at(MON, time), endAt: at(MON, '18:00'), reason: 'race' }),
    ]);
    const bookingWon = b.ok && codeOf(o) === 'TIME_OFF_HAS_BOOKINGS';
    const leaveWon = o.ok && codeOf(b) === 'TIME_OFF';
    if (!(bookingWon || leaveWon)) clean = false;
    if (b.ok) cleanup.bookings.push(b.data.id);
    if (o.ok) cleanup.timeOff.push([grace.id, o.data.id]);
    await runCleanup();
  }
  check(clean, '5 rounds: every time exactly one wins (booking → leave flagged, or leave → booking refused)');

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll booking rules enforced by the server.');
  process.exit(failed ? 1 : 0);
});
