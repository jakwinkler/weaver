import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores';

export function AdminRoute() {
  const isAdmin = useAuthStore((s) => s.isAdmin());

  if (!isAdmin) {
    return <Navigate to="/projects" replace />;
  }

  return <Outlet />;
}
