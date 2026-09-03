import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/api';

export function AdminRoute() {
  const { data: currentUser, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Checking access...
      </div>
    );
  }

  if (
    isError ||
    (currentUser?.role !== 'owner' && currentUser?.role !== 'admin')
  ) {
    return <Navigate to="/projects" replace />;
  }

  return <Outlet />;
}
