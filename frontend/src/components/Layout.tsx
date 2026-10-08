import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? '#f4eee4' : '#1f2d27'} />
        <path d="M32 14c-6 8-9 14-9 20a9 9 0 0 0 18 0c0-6-3-12-9-20z" fill="#cda977" />
        <path d="M18 40c4 6 9 9 14 9s10-3 14-9" stroke={light ? '#1f2d27' : '#f4eee4'} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      <span className={`font-display text-2xl font-semibold leading-none ${light ? 'text-sand-50' : 'text-forest-900'}`}>
        TK Signature <span className="text-gold-500">Spa</span>
      </span>
    </Link>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: '/treatments', label: 'Treatments' },
    ...(user ? [{ to: '/my-bookings', label: 'My bookings' }] : []),
    ...(user && user.role !== 'CLIENT' ? [{ to: '/admin', label: user.role === 'ADMIN' ? 'Admin' : 'My schedule' }] : []),
  ];
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition ${isActive ? 'text-forest-900' : 'text-forest-700/70 hover:text-forest-900'}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-sand-50/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navCls}>
                {l.label}
              </NavLink>
            ))}
            {user ? (
              <button onClick={() => { logout(); navigate('/'); }} className="text-sm font-medium text-forest-700/70 hover:text-forest-900">
                Sign out
              </button>
            ) : (
              <NavLink to="/login" className={navCls}>Sign in</NavLink>
            )}
            <Link to="/book" className="btn-primary">Book now</Link>
          </nav>
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {open && (
          <nav className="flex flex-col gap-4 border-t border-sand-200 px-4 py-4 md:hidden" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navCls}>{l.label}</NavLink>
            ))}
            {user ? (
              <button onClick={() => { logout(); navigate('/'); }} className="text-left text-sm font-medium text-forest-700/70">Sign out</button>
            ) : (
              <NavLink to="/login" className={navCls}>Sign in</NavLink>
            )}
            <Link to="/book" className="btn-primary">Book now</Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-forest-900 text-sand-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm text-sand-100/70">A sanctuary for massage, skin and body rituals. Slow down, breathe, restore.</p>
          </div>
          <div className="text-sm">
            <p className="eyebrow mb-3 !text-gold-400">Opening hours</p>
            <p className="text-sand-100/80">Mon - Fri · 09:00 - 19:00</p>
            <p className="text-sand-100/80">Saturday · 09:00 - 19:00</p>
            <p className="text-sand-100/80">Sunday · 10:00 - 14:00</p>
          </div>
          <div className="text-sm">
            <p className="eyebrow mb-3 !text-gold-400">Visit us</p>
            <p className="text-sand-100/80">hello@tksigspa.com</p>
            <p className="text-sand-100/80">+263 00 000 0000</p>
          </div>
        </div>
        <p className="border-t border-sand-100/10 py-5 text-center text-xs text-sand-100/50">
          © {new Date().getFullYear()} TK Signature Spa. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
