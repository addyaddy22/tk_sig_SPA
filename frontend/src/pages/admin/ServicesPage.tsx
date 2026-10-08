import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDuration, money } from '../../lib/time';
import type { Service } from '../../lib/types';

export function ServicesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['services', 'admin-all'], queryFn: () => api<Service[]>('/services/admin/all') });
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-semibold">Services</h1>
        <button className="btn-gold" onClick={() => setEditing('new')}>+ Add service</button>
      </div>
      {isLoading && <Spinner />}
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-sand-200 text-xs uppercase tracking-wider text-forest-700/60">
              <tr>
                <th className="p-4">Treatment</th><th className="p-4">Category</th><th className="p-4">Duration</th>
                <th className="p-4">Cleanup</th><th className="p-4">Price</th><th className="p-4">Therapists</th><th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className={`border-b border-sand-100 last:border-0 ${s.active ? '' : 'opacity-50'}`}>
                  <td className="p-4 font-semibold">{s.name}{!s.active && ' (inactive)'}</td>
                  <td className="p-4">{s.category}</td>
                  <td className="p-4">{fmtDuration(s.durationMin)}</td>
                  <td className="p-4">{s.bufferMin} min</td>
                  <td className="p-4">{money(s.priceCents)}</td>
                  <td className="p-4">{s.therapists?.length ?? 0}{s.therapists?.length === 0 && <span className="ml-1 text-amber-700">⚠ unbookable</span>}</td>
                  <td className="p-4 text-right"><button className="btn-ghost !py-1.5" onClick={() => setEditing(s)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ServiceForm service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: service?.name ?? '',
    category: service?.category ?? '',
    description: service?.description ?? '',
    durationMin: service?.durationMin ?? 60,
    bufferMin: service?.bufferMin ?? 15,
    price: service ? (service.priceCents / 100).toFixed(2) : '',
    active: service?.active ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, category: f.category, description: f.description,
        durationMin: Number(f.durationMin), bufferMin: Number(f.bufferMin),
        priceCents: Math.round(parseFloat(f.price || '0') * 100), active: f.active,
      };
      return service ? api(`/services/${service.id}`, { method: 'PATCH', body }) : api('/services', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={service ? 'Edit service' : 'New service'}>
      <div className="space-y-4">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Category</label><input className="input" list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="cats"><option value="Massage" /><option value="Facials" /><option value="Body" /><option value="Nails" /></datalist></div>
        <div><label className="label">Description</label><textarea className="input min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Minutes</label><input type="number" step={15} min={15} className="input" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: +e.target.value })} /></div>
          <div><label className="label">Cleanup</label><input type="number" step={15} min={0} className="input" value={f.bufferMin} onChange={(e) => setF({ ...f, bufferMin: +e.target.value })} /></div>
          <div><label className="label">Price</label><input type="number" step="0.01" min={0} className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest-700" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (shown to clients)</label>
        {save.error && <Alert>{(save.error as Error).message}</Alert>}
        <div className="flex justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!f.name || !f.category || save.isPending} onClick={() => save.mutate()}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
