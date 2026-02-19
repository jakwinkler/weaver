import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { useProjects } from '@/api';

export function AppLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: projectsData } = useProjects();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-5">
          <Link to="/projects" className="text-xl font-bold text-indigo-600">
            Weaver
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Projects
          </h3>
          <ul className="space-y-1">
            {projectsData?.data.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.key}`}
                  className="flex items-center rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <span className="mr-2 flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-xs font-medium text-indigo-600">
                    {project.key.slice(0, 2)}
                  </span>
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-end border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
