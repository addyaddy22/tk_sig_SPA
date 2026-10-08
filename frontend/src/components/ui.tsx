import type { ReactNode } from 'react';
import type { BookingStatus } from '../lib/types';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-forest-700/70" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest-600/30 border-t-forest-600" />
      {label}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-forest-600/20 bg-forest-100 text-forest-800',
    info: 'border-sand-300 bg-sand-100 text-forest-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

const statusStyles: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-forest-100 text-forest-800',
  CANCELLED: 'bg-stone-200 text-stone-600',
  COMPLETED: 'bg-sky-100 text-sky-800',
  NO_SHOW: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}>
      {status.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-4xl font-semibold text-forest-900 sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-forest-700/80">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-forest-950/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-forest-700 hover:bg-sand-100" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
