/**
 * 数据面路由薄壳：只做协议（参数解析 + JSON 响应 + 错误转 500），
 * 一行业务逻辑都不多写——全部调 board / ledger-read 的方法（2026-10-17 定稿）。
 * 宿主事实（handler = 原始 Node req/res、发头后不抛错、重复 path 注册直接 throw）
 * 见 external/host-webserver.md。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type RegistryWorkspace } from './workspace.js';
/** 宿主 webServer.register 的最小面（WebRoute 形状见 external/host-webserver.md）。 */
export interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): unknown;
}
/** 宿主 workspaceRegistry 的最小面（事实见 external/dsh-workspace-registry.md）。 */
export interface WorkspaceRegistryLike {
    list(): readonly RegistryWorkspace[];
}
export interface RouteDeps {
    readonly registry: WorkspaceRegistryLike;
}
export declare function registerRoutes(webServer: WebServerLike, deps: RouteDeps): void;
