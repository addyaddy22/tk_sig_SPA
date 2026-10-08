import { Link } from 'react-router-dom';
import { useServices } from '../lib/queries';
import { fmtDuration, money } from '../lib/time';

const pillars = [
  { title: 'Real-time availability', text: 'See only the times that are genuinely free - no phone tag, no double bookings.' },
  { title: 'Choose your therapist', text: 'Book your favourite, or let us match you with whoever is free.' },
  { title: 'Instant confirmation', text: 'Your slot is locked the moment you confirm, with a booking reference.' },
];

export function HomePage() {
  const { data: services } = useServices();
  const featured = services?.slice(0, 6) ?? [];

  return (
    <>
      <section className="relative overflow-hidden bg-forest-900 text-sand-50">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-gold-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-52 -left-24 h-[28rem] w-[28rem] rounded-full bg-forest-600/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-28">
          <div>
            <p className="eyebrow !text-gold-400">Massage · Facials · Body · Nails</p>
            <h1 className="mt-4 text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
              Unhurried rituals for body &amp; mind.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-sand-100/75">
              Step out of the everyday. Our therapists craft every treatment around you - book the time and therapist that suit you in under a minute.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/book" className="btn-gold !px-7 !py-3 text-base">Book a treatment</Link>
              <Link to="/treatments" className="btn !px-7 !py-3 text-base border border-sand-100/25 text-sand-50 hover:bg-sand-50/10">
                Explore treatments
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative mx-auto aspect-[4/5] max-w-sm">
              <div className="absolute inset-0 rounded-[10rem_10rem_2rem_2rem] bg-gradient-to-b from-gold-400/80 via-sand-200/70 to-forest-700/70" />
              <svg viewBox="0 0 200 250" className="absolute inset-0 h-full w-full" aria-hidden>
                <g fill="none" stroke="#1f2d27" strokeOpacity="0.35" strokeWidth="1.2">
                  {Array.from({ length: 9 }, (_, i) => (
                    <path key={i} d={`M100 ${40 + i * 4} C ${60 - i * 4} ${100 + i * 6}, ${70 - i * 3} ${170 + i * 3}, 100 ${200 + i * 2} C ${130 + i * 3} ${170 + i * 3}, ${140 + i * 4} ${100 + i * 6}, 100 ${40 + i * 4}Z`} />
                  ))}
                </g>
              </svg>
              <div className="absolute -bottom-6 -left-8 rounded-2xl bg-sand-50 px-5 py-4 text-forest-900 shadow-xl">
                <p className="font-display text-3xl font-semibold">4.9★</p>
                <p className="text-xs text-forest-700/70">from 1,200+ guests</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map((p, i) => (
            <div key={p.title} className="card p-7">
              <span className="font-display text-4xl font-semibold text-gold-500">0{i + 1}</span>
              <h3 className="mt-3 text-2xl font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-forest-700/80">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sand-100">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Our menu</p>
              <h2 className="mt-2 text-4xl font-semibold sm:text-5xl">Signature treatments</h2>
            </div>
            <Link to="/treatments" className="btn-ghost">View all</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((s) => (
              <Link key={s.id} to={`/book?service=${s.id}`} className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="eyebrow">{s.category}</p>
                <h3 className="mt-2 text-2xl font-semibold group-hover:text-forest-700">{s.name}</h3>
                <p className="mt-2 flex-1 text-sm text-forest-700/75">{s.description}</p>
                <div className="mt-5 flex items-center justify-between border-t border-sand-200 pt-4 text-sm">
                  <span className="text-forest-700/70">{fmtDuration(s.durationMin)}</span>
                  <span className="font-semibold">{money(s.priceCents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-4xl font-semibold sm:text-5xl">Your time, protected.</h2>
        <p className="mx-auto mt-4 max-w-xl text-forest-700/80">
          Every slot you see is live. The moment you confirm, it's yours - no one else can book that therapist at that time.
        </p>
        <Link to="/book" className="btn-primary mt-8 !px-8 !py-3 text-base">Find a time</Link>
      </section>
    </>
  );
}
