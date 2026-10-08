import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import { useAuth } from './context/AuthContext';
import { useConfig } from './lib/queries';
import { configureLocale } from './lib/time';
import type { Role } from './lib/types';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { BookPage } from './pages/BookPage';
import { HomePage } from './pages/HomePage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { TreatmentsPage } from './pages/TreatmentsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { BookingsPage } from './pages/admin/BookingsPage';
import { SchedulePage } from './pages/admin/SchedulePage';
import { ServicesPage } from './pages/admin/ServicesPage';
import { TherapistsPage } from './pages/admin/TherapistsPage';

function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="mx-auto max-w-6xl px-6"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { data: config, error } = useConfig();

  useEffect(() => {
    if (config) configureLocale(config.timezone, config.currency);
  }, [config]);

  if (error) {
    return <div className="mx-auto max-w-lg p-10"><Alert>Can't reach the booking server. Please try again shortly.</Alert></div>;
  }
  if (!config) return <div className="mx-auto max-w-6xl px-6"><Spinner /></div>;
  configureLocale(config.timezone, config.currency);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="treatments" element={<TreatmentsPage />} />
        <Route path="book" element={<BookPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="my-bookings" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth roles={['ADMIN', 'THERAPIST']}><AdminLayout /></RequireAuth>}>
          <Route index element={<SchedulePage />} />
          <Route path="bookings" element={<RequireAuth roles={['ADMIN']}><BookingsPage /></RequireAuth>} />
          <Route path="therapists" element={<RequireAuth roles={['ADMIN']}><TherapistsPage /></RequireAuth>} />
          <Route path="services" element={<RequireAuth roles={['ADMIN']}><ServicesPage /></RequireAuth>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
