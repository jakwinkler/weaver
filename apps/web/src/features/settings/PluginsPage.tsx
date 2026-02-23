import {
  useAvailablePlugins,
  useInstalledPlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
} from '@/api/hooks-phase4';
import { Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PLUGIN_ICONS, DEFAULT_PLUGIN_ICON } from '@/plugins/plugin-icons';

function PluginIcon({ iconName }: { iconName?: string }) {
  const Icon = iconName ? PLUGIN_ICONS[iconName] || DEFAULT_PLUGIN_ICON : DEFAULT_PLUGIN_ICON;
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

  const isInstalled = (pluginId: string) =>
    installed?.some((p) => p.pluginId === pluginId) ?? false;

  const isLoading = availableLoading || installedLoading;

  if (isLoading) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Loading plugins...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Plugins</h1>

      <Tabs defaultValue="installed">
        <TabsList className="mb-6">
          <TabsTrigger value="installed">
            Installed ({installed?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available ({available?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Installed Tab */}
        <TabsContent value="installed">
          <div className="space-y-4">
            {!installed || installed.length === 0 ? (
              <Card>
                <CardContent className="px-6 py-12 text-center">
                  <Puzzle className="mx-auto h-12 w-12 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">No plugins installed.</p>
                  <Button
                    variant="link"
                    className="mt-3 h-auto p-0 text-sm"
                    onClick={() => {
                      const trigger = document.querySelector<HTMLButtonElement>(
                        '[role="tab"][data-state][value="available"]'
                      );
                      trigger?.click();
                    }}
                  >
                    Browse available plugins
                  </Button>
                </CardContent>
              </Card>
            ) : (
              installed.map((plugin) => {
                const manifest = available?.find((a) => a.id === plugin.pluginId);
                return (
                  <Card key={plugin.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <PluginIcon iconName={manifest?.icon} />
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-lg font-semibold text-foreground">
                                {manifest?.name || plugin.pluginId}
                              </h3>
                              <Badge variant="secondary">v{plugin.version}</Badge>
                              <Badge
                                className={cn(
                                  plugin.enabled
                                    ? 'border-transparent bg-green-100 text-green-700'
                                    : 'border-transparent bg-muted text-muted-foreground'
                                )}
                              >
                                {plugin.enabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                            {manifest?.description && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {manifest.description}
                              </p>
                            )}
                            {manifest?.permissions && manifest.permissions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {manifest.permissions.map((perm) => (
                                  <Badge key={perm} variant="secondary">
                                    {perm}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {plugin.enabled ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disablePlugin.mutate(plugin.pluginId)}
                              disabled={disablePlugin.isPending}
                            >
                              Disable
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => enablePlugin.mutate(plugin.pluginId)}
                              disabled={enablePlugin.isPending}
                            >
                              Enable
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => uninstallPlugin.mutate(plugin.pluginId)}
                            disabled={uninstallPlugin.isPending}
                          >
                            Uninstall
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Available Tab */}
        <TabsContent value="available">
          <div className="space-y-4">
            {!available || available.length === 0 ? (
              <Card>
                <CardContent className="px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">No plugins available.</p>
                </CardContent>
              </Card>
            ) : (
              available.map((plugin) => {
                const alreadyInstalled = isInstalled(plugin.id);
                return (
                  <Card key={plugin.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <PluginIcon iconName={plugin.icon} />
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-lg font-semibold text-foreground">
                                {plugin.name}
                              </h3>
                              <Badge variant="secondary">v{plugin.version}</Badge>
                              {plugin.author && (
                                <span className="text-xs text-muted-foreground">
                                  by {plugin.author}
                                </span>
                              )}
                            </div>
                            {plugin.description && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {plugin.description}
                              </p>
                            )}
                            {plugin.permissions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {plugin.permissions.map((perm) => (
                                  <Badge key={perm} variant="secondary">
                                    {perm}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {alreadyInstalled ? (
                            <Badge
                              className="border-transparent bg-green-100 text-green-700 px-3 py-1.5 text-sm"
                            >
                              Installed
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => installPlugin.mutate(plugin.id)}
                              disabled={installPlugin.isPending}
                            >
                              {installPlugin.isPending ? 'Installing...' : 'Install'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
