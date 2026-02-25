import { TimerWidget } from './TimerWidget';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

interface TimerWidgetWrapperProps {
  pluginContext: { coreApi: PluginApi; currentUserId: string };
  issueKey: string;
}

export function TimerWidgetWrapper({ pluginContext, issueKey }: TimerWidgetWrapperProps) {
  const handleLogTime = async (minutes: number, description?: string) => {
    await pluginContext.coreApi.post(`/issues/${issueKey}/time-entries`, {
      minutes,
      description,
    });
  };

  return (
    <TimerWidget
      issueKey={issueKey}
      userId={pluginContext.currentUserId}
      onLogTime={handleLogTime}
    />
  );
}
