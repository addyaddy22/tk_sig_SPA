import { Link } from 'react-router-dom';
import { Alert, PageHeader, Spinner } from '../components/ui';
import { useServices } from '../lib/queries';
import { fmtDuration, money } from '../lib/time';

export function TreatmentsPage() {
  const { data, isLoading, error } = useServices();
  const categories = [...new Set((data ?? []).map((s) => s.category))];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <PageHeader eyebrow="Treatments" title="The spa menu">
        Every treatment includes time to arrive, settle in and unwind afterwards.
      </PageHeader>
      {isLoading && <Spinner />}
      {error && <Alert>{(error as Error).message}</Alert>}
      <div className="space-y-14">
        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-5 border-b border-sand-200 pb-3 text-3xl font-semibold">{cat}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {data!.filter((s) => s.category === cat).map((s) => (
                <div key={s.id} className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <h3 className="text-2xl font-semibold">{s.name}</h3>
                    <p className="mt-1 text-sm text-forest-700/75">{s.description}</p>
                    <p className="mt-3 text-sm text-forest-700/70">
                      {fmtDuration(s.durationMin)} · <span className="font-semibold text-forest-900">{money(s.priceCents)}</span>
                    </p>
                  </div>
                  <Link to={`/book?service=${s.id}`} className="btn-primary shrink-0">Book</Link>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
