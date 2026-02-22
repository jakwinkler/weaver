import { useState } from 'react';
import {
  useAvailablePlugins,
  useInstalledPlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
} from '@/api/hooks-phase4';
import {
  Timer,
  GitBranch,
  Github,
  Gitlab,
  FolderGit2,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';

const PLUGIN_ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  'git-branch': GitBranch,
  github: Github,
  gitlab: Gitlab,
  'folder-git-2': FolderGit2,
};

function PluginIcon({ iconName }: { iconName?: string }) {
  const Icon = iconName ? PLUGIN_ICONS[iconName] || Puzzle : Puzzle;
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function PluginsPage() {
  const { data: available, isLoading: availableLoading } = useAvailablePlugins();
  const { data: installed, isLoading: installedLoading } = useInstalledPlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();

  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');

  const isInstalled = (pluginId: string) =>
    installed?.some((p) => p.pluginId === pluginId) ?? false;

  const isLoading = availableLoading || installedLoading;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-gray-500">Loading plugins...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Plugins</h1>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('installed')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'installed'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Installed ({installed?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab('available')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'available'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Available ({available?.length ?? 0})
          </button>
        </nav>
      </div>

      {/* Installed Tab */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {!installed || installed.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <p className="mt-3 text-sm text-gray-500">No plugins installed.</p>
              <button
                onClick={() => setActiveTab('available')}
                className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Browse available plugins
              </button>
            </div>
          ) : (
            installed.map((plugin) => {
              const manifest = available?.find((a) => a.id === plugin.pluginId);
              return (
                <div
                  key={plugin.id}
                  className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <PluginIcon iconName={manifest?.icon} />
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {manifest?.name || plugin.pluginId}
                          </h3>
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            v{plugin.version}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              plugin.enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {plugin.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      {manifest?.description && (
                        <p className="mt-1 text-sm text-gray-500">
                          {manifest.description}
                        </p>
                      )}
                      {manifest?.permissions && manifest.permissions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {manifest.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {plugin.enabled ? (
                        <button
                          onClick={() => disablePlugin.mutate(plugin.pluginId)}
                          disabled={disablePlugin.isPending}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => enablePlugin.mutate(plugin.pluginId)}
                          disabled={enablePlugin.isPending}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Enable
                        </button>
                      )}
                      <button
                        onClick={() => uninstallPlugin.mutate(plugin.pluginId)}
                        disabled={uninstallPlugin.isPending}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Uninstall
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Available Tab */}
      {activeTab === 'available' && (
        <div className="space-y-4">
          {!available || available.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-gray-500">No plugins available.</p>
            </div>
          ) : (
            available.map((plugin) => {
              const alreadyInstalled = isInstalled(plugin.id);
              return (
                <div
                  key={plugin.id}
                  className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <PluginIcon iconName={plugin.icon} />
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {plugin.name}
                          </h3>
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            v{plugin.version}
                          </span>
                          {plugin.author && (
                            <span className="text-xs text-gray-400">
                              by {plugin.author}
                            </span>
                          )}
                        </div>
                        {plugin.description && (
                          <p className="mt-1 text-sm text-gray-500">
                            {plugin.description}
                          </p>
                        )}
                        {plugin.permissions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {plugin.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="inline-flex rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      {alreadyInstalled ? (
                        <span className="inline-flex rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700">
                          Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => installPlugin.mutate(plugin.id)}
                          disabled={installPlugin.isPending}
                          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {installPlugin.isPending ? 'Installing...' : 'Install'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
