import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function AdminLayout() {
  const { user } = useAuth();
  const tabs = [
    { to: '/admin', label: 'Schedule', end: true },
    ...(user?.role === 'ADMIN'
      ? [
          { to: '/admin/bookings', label: 'All bookings' },
          { to: '/admin/therapists', label: 'Therapists' },
          { to: '/admin/services', label: 'Services' },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-sand-200 pb-4">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-forest-800 text-sand-50' : 'text-forest-700 hover:bg-sand-100'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
