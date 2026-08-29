import type { PluginContext } from './plugin-context.interface';
import type { PluginManifest } from './plugin-manifest.interface';

export interface WeaverPlugin {
  manifest: PluginManifest;

  /** Called when plugin is first installed for a tenant */
  onInstall?(context: PluginContext): Promise<void>;

  /** Called when plugin is enabled for a tenant */
  onEnable?(context: PluginContext): Promise<void>;

  /** Called inside an atomic migration when an installed plugin version advances */
  onUpgrade?(fromVersion: string, toVersion: string, context: PluginContext): Promise<void>;

  /** Called when plugin is disabled for a tenant */
  onDisable?(context: PluginContext): Promise<void>;

  /** Called when plugin is uninstalled from a tenant */
  onUninstall?(context: PluginContext): Promise<void>;

  /** React to domain events */
  onEvent?(event: string, data: unknown, context: PluginContext): Promise<void>;

  /** Register custom API routes */
  registerRoutes?(router: PluginRouter): void;

  /** Register custom workflow conditions */
  registerWorkflowConditions?(registry: ConditionRegistry): void;

  /** Register custom workflow post-functions */
  registerWorkflowPostFunctions?(registry: PostFunctionRegistry): void;
}

export interface PluginRouter {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  patch(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
}

export type RouteHandler = (req: PluginRequest, context: PluginContext) => Promise<PluginResponse>;

export interface PluginRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface PluginResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ConditionRegistry {
  register(name: string, evaluator: ConditionEvaluator): void;
}

export type ConditionEvaluator = (params: Record<string, unknown>, context: PluginContext) => Promise<boolean>;

export interface PostFunctionRegistry {
  register(name: string, fn: PostFunction): void;
}

export type PostFunction = (params: Record<string, unknown>, context: PluginContext) => Promise<void>;
