import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { useProjects, useUnreadCount } from '@/api';
import {
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Tags,
  Shield,
  Users,
  UsersRound,
  Plug,
  Webhook,
  Settings,
  LogOut,
} from 'lucide-react';

const adminNavItems = [
  { to: '/admin/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/admin/issue-types', label: 'Issue Types', icon: Tags },
  { to: '/settings/custom-fields', label: 'Custom Fields', icon: Settings },
  { to: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
  { to: '/admin/teams', label: 'Teams', icon: UsersRound },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/settings/plugins', label: 'Plugins', icon: Plug },
  { to: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const logout = useAuthStore((s) => s.logout);
  const { data: projectsData } = useProjects();
  const { data: unreadCount } = useUnreadCount();
  const [adminOpen, setAdminOpen] = useState(
    location.pathname.startsWith('/admin') || location.pathname.startsWith('/settings'),
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="relative z-10 flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-5">
          <Link to="/projects" className="text-xl font-bold text-indigo-600">
            Weaver
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Search link */}
          <Link
            to="/search"
            className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <Search className="h-4 w-4" />
            Search
          </Link>

          {/* Projects section */}
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Projects
          </h3>
          <ul className="space-y-1">
            {projectsData?.data.map((project) => (
              <li key={project.id} className="group relative">
                <Link
                  to={`/projects/${project.key}`}
                  className={`flex items-center rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 ${
                    location.pathname.includes(`/projects/${project.key}`) ? 'bg-gray-100 font-medium' : ''
                  }`}
                >
                  <span className="mr-2 flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-xs font-medium text-indigo-600">
                    {project.key.slice(0, 2)}
                  </span>
                  {project.name}
                </Link>
                <Link
                  to={`/projects/${project.key}/settings`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100"
                  title="Project settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Administration section (admin/owner only) */}
          {isAdmin && (
            <div className="mt-6">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
              >
                {adminOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Administration
              </button>
              {adminOpen && (
                <ul className="mt-1 space-y-1">
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.to;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </nav>
      </aside>

      {/* Main area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-end border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <Bell className="h-5 w-5" />
              {unreadCount != null && unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              <LogOut className="h-4 w-4" />
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
