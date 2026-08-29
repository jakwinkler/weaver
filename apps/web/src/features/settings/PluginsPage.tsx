import {
  useAvailablePlugins,
  useInstalledPlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
  usePluginSettings,
  useUpdatePluginSettings,
  type PluginSettingsSchema,
} from '@/api/hooks-phase4';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Puzzle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getPluginIcon } from '@/plugins/plugin-icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PluginSettingsForm } from './PluginSettingsForm';

function PluginIcon({ iconName }: { iconName?: string }) {
  const Icon = getPluginIcon(iconName);
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
      <Icon className="h-5 w-5" />
    </span>
  );
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  app: 'bg-blue-100 text-blue-700',
  widget: 'bg-purple-100 text-purple-700',
  feature: 'bg-emerald-100 text-emerald-700',
  integration: 'bg-amber-100 text-amber-700',
};

function PluginTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  return (
    <Badge
      className={cn(
        'border-transparent capitalize',
        TYPE_BADGE_STYLES[type] || 'bg-muted text-muted-foreground',
      )}
    >
      {type}
    </Badge>
  );
}

function isSensitiveSetting(key: string): boolean {
  return /secret|token|password|private.?key|api.?key/i.test(key);
}

function settingLabel(key: string, schema: PluginSettingsSchema): string {
  if (schema[key]?.label) return schema[key].label;
  const spaced = key
    .replace(
      /([a-z0-9])([A-Z])/g,
      (_match, before: string, uppercase: string) => `${before} ${uppercase.toLowerCase()}`,
    )
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatSettingsSummary(
  settings: Record<string, unknown>,
  schema: PluginSettingsSchema,
): string {
  if (Object.keys(schema).length === 0) return 'No configurable settings';
  const configuredSettings = Object.entries(settings).filter(
    ([, value]) => value !== '' && value !== null && value !== undefined,
  );
  if (configuredSettings.length === 0) return 'Default settings';

  return configuredSettings
    .map(([key, value]) => {
      const displayedValue = isSensitiveSetting(key)
        ? 'configured'
        : typeof value === 'boolean'
          ? value
            ? 'on'
            : 'off'
          : String(value);
      return `${settingLabel(key, schema)}=${displayedValue}`;
    })
    .join(', ');
}

function getFieldErrors(error: unknown): Record<string, string> {
  if (!isAxiosError(error)) return {};
  const response = error.response?.data as { errors?: Record<string, string> } | undefined;
  return response?.errors ?? {};
}

interface PluginSettingsDialogProps {
  pluginId: string;
  pluginName: string;
  schema: PluginSettingsSchema;
}

function PluginSettingsDialog({
  pluginId,
  pluginName,
  schema,
}: PluginSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const settingsQuery = usePluginSettings(pluginId, open);
  const updateSettings = useUpdatePluginSettings(pluginId);
  const hasFields = Object.keys(schema).length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setServerErrors({});
  };

  const saveSettings = async (settings: Record<string, unknown>) => {
    setServerErrors({});
    try {
      await updateSettings.mutateAsync(settings);
      setOpen(false);
    } catch (error) {
      setServerErrors(getFieldErrors(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="mr-1.5 h-4 w-4" />
        Settings
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pluginName} settings</DialogTitle>
          <DialogDescription>Configure this plugin for your organization.</DialogDescription>
        </DialogHeader>

        {!hasFields ? (
          <p className="text-sm text-muted-foreground">
            This plugin has no configurable settings.
          </p>
        ) : settingsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        ) : settingsQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Settings could not be loaded. Close this dialog and try again.
          </p>
        ) : (
          <PluginSettingsForm
            schema={schema}
            values={settingsQuery.data ?? {}}
            onSubmit={saveSettings}
            onCancel={() => setOpen(false)}
            isSaving={updateSettings.isPending}
            serverErrors={serverErrors}
          />
        )}
      </DialogContent>
    </Dialog>
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

  const notInstalled = available?.filter((p) => !isInstalled(p.id)) ?? [];

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
          <TabsTrigger value="installed">Installed ({installed?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="available">Available ({notInstalled.length})</TabsTrigger>
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
                        '[role="tab"][data-state][value="available"]',
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
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <PluginIcon iconName={manifest?.icon} />
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-lg font-semibold text-foreground">
                                {manifest?.name || plugin.pluginId}
                              </h3>
                              <Badge variant="secondary">v{plugin.version}</Badge>
                              <PluginTypeBadge type={manifest?.type} />
                              <Badge
                                className={cn(
                                  plugin.enabled
                                    ? 'border-transparent bg-green-100 text-green-700'
                                    : 'border-transparent bg-muted text-muted-foreground',
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
                            <div className="mt-3">
                              <p className="text-xs font-medium text-muted-foreground">Settings</p>
                              <p className="mt-0.5 text-sm text-foreground">
                                {formatSettingsSummary(
                                  plugin.settings,
                                  manifest?.settings?.schema ?? {},
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <PluginSettingsDialog
                            pluginId={plugin.pluginId}
                            pluginName={manifest?.name || plugin.pluginId}
                            schema={manifest?.settings?.schema ?? {}}
                          />
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
            {notInstalled.length === 0 ? (
              <Card>
                <CardContent className="px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">No plugins available.</p>
                </CardContent>
              </Card>
            ) : (
              notInstalled.map((plugin) => {
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
                              <PluginTypeBadge type={plugin.type} />
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
                          <Button
                            size="sm"
                            onClick={() => installPlugin.mutate(plugin.id)}
                            disabled={installPlugin.isPending}
                          >
                            {installPlugin.isPending ? 'Installing...' : 'Install'}
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
      </Tabs>
    </div>
  );
}
