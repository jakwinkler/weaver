export interface PluginApiMethods {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

export interface PluginComponentContext {
  pluginId: string;
  pluginRouteId: string;
  api: PluginApiMethods;
  coreApi: PluginApiMethods;
  currentUserId: string;
}
