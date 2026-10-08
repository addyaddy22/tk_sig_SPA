import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import type { User } from '../lib/types';

const homeFor = (u: User, next: string | null) => next ?? (u.role === 'CLIENT' ? '/my-bookings' : '/admin');

function AuthShell({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-center text-5xl font-semibold">{title}</h1>
      <p className="mt-3 text-center text-sm text-forest-700/80">{subtitle}</p>
      <div className="card mt-8 p-7">{children}</div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      navigate(homeFor(u, next), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle={<>No account? <Link className="font-semibold underline" to={`/register${next ? `?next=${next}` : ''}`}>Create one</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await register({ ...form, phone: form.phone || undefined });
      navigate(homeFor(u, next), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle={<>Already registered? <Link className="font-semibold underline" to={`/login${next ? `?next=${next}` : ''}`}>Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label" htmlFor="remail">Email</label>
          <input id="remail" className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone (optional)</label>
          <input id="phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label" htmlFor="rpassword">Password</label>
          <input id="rpassword" className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <p className="mt-1 text-xs text-forest-700/60">At least 8 characters.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}
