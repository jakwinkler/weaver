import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useThemeStore } from '@/stores';
import { useProjects, useInstalledPlugins, useAvailablePlugins, useMyPermissions } from '@/api';
import { ProjectIcon } from '@/features/projects/ProjectSettingsPage';
import { NotificationPanel } from '@/features/notifications/NotificationPanel';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search,
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
  User,
  Sun,
  Moon,
  Cog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNavigationEntries } from '@/plugins/plugin-slot-registry';
import { getPluginIcon } from '@/plugins/plugin-icons';
import { useWebSocket } from '@/hooks/useWebSocket';

const adminNavItems = [
  { to: '/admin/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/admin/issue-types', label: 'Issue Types', icon: Tags },
  { to: '/settings/custom-fields', label: 'Custom Fields', icon: Settings },
  { to: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
  { to: '/admin/teams', label: 'Teams', icon: UsersRound },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/settings/plugins', label: 'Plugins', icon: Plug },
  { to: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/settings/general', label: 'System Settings', icon: Cog },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const logout = useAuthStore((s) => s.logout);
  const { data: projectsData } = useProjects();
  const { data: installedPlugins } = useInstalledPlugins();
  const { data: availablePlugins } = useAvailablePlugins();
  const permissions = useMyPermissions();
  const [adminOpen, setAdminOpen] = useState(
    location.pathname.startsWith('/admin') || location.pathname.startsWith('/settings'),
  );
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [appsOpen, setAppsOpen] = useState(location.pathname.startsWith('/apps'));

  // Initialize WebSocket connection for real-time updates
  useWebSocket();

  const enabledPluginIds = (installedPlugins ?? [])
    .filter((p) => p.enabled)
    .map((p) => p.pluginId);
  const appTypePluginIds = new Set(
    (availablePlugins ?? []).filter((p) => p.type === 'app').map((p) => p.id),
  );
  const navEntries = getNavigationEntries(availablePlugins ?? [], enabledPluginIds)
    .filter((entry) => appTypePluginIds.has(entry.pluginId))
    .filter((entry) =>
      permissions.includes('*') || entry.requiredPermissions.every((perm) => permissions.includes(perm)),
    );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-muted/50">
      {/* Sidebar */}
      <aside className="relative z-10 flex w-64 flex-col bg-slate-900 text-white">
        <div className="flex h-14 items-center border-b border-white/10 px-5">
          <Link to="/" className="text-xl font-bold text-white">
            Weaver
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Projects section */}
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            Projects
          </h3>
          <ul className="space-y-1">
            {projectsData?.data.map((project) => (
              <li key={project.id} className="group relative">
                <Link
                  to={`/projects/${project.key}`}
                  className={cn(
                    'flex items-center rounded-md px-2 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white',
                    location.pathname.includes(`/projects/${project.key}`) && 'bg-white/15 text-white font-medium',
                  )}
                >
                  <span className="mr-2">
                    <ProjectIcon iconAttachmentId={project.iconAttachmentId} projectKey={project.key} size="sm" />
                  </span>
                  {project.name}
                </Link>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/projects/${project.key}/settings`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Project settings</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>

          {/* Apps section (visible when plugins have navigation entries) */}
          {navEntries.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setAppsOpen(!appsOpen)}
                className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white"
              >
                {appsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Apps
              </button>
              {appsOpen && (
                <ul className="mt-1 space-y-1">
                  {navEntries.map((entry) => {
                    const Icon = getPluginIcon(entry.icon);
                    const isActive = location.pathname.startsWith(entry.path);
                    return (
                      <li key={entry.path}>
                        <Link
                          to={entry.path}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                            isActive
                              ? 'bg-white/15 text-white font-medium'
                              : 'text-white/70 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {entry.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Administration section (admin/owner only) */}
          {isAdmin && (
            <div className="mt-6">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white"
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
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                            isActive
                              ? 'bg-white/15 text-white font-medium'
                              : 'text-white/70 hover:bg-white/10 hover:text-white',
                          )}
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
        <header className="flex h-14 items-center justify-between bg-slate-900 px-6">
          {/* Search bar */}
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              placeholder="Search issues, projects, people..."
              className="w-full bg-white/10 py-1.5 pl-9 pr-4 text-sm text-white placeholder-white/50 border border-white/15 focus:bg-white/15 focus:outline-none focus:ring-1 focus:ring-white/30"
              onFocus={() => navigate('/search')}
              readOnly
            />
          </div>

          <div className="flex items-center gap-3">
            <NotificationPanel />

            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'dark' : 'dark')}
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 bg-white/20" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 text-white/80 hover:text-white hover:bg-white/10">
                  <UserAvatar user={user} size="sm" />
                  <span className="text-sm">{user?.displayName || user?.email}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
