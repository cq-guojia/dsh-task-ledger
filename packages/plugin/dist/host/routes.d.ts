/**
 * 数据面路由薄壳：只做协议（参数解析 + JSON 响应 + 错误转 500），
 * 一行业务逻辑都不多写——全部调 board / ledger-read 的方法（2026-10-17 定稿）。
 * 宿主事实（handler = 原始 Node req/res、发头后不抛错、重复 path 注册直接 throw）
 * 见 external/host-webserver.md。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type AgentsLike } from './services/session.service.js';
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
/**
 * 注册认领 / 释放端点（2026-10-18 B 混合制：没有判断量的动作由 host 直跑脚本）。
 *
 * 这两条**会改磁盘上的台账文件**，所以和 `/close` 一样必须过同源守卫；
 * 成功后就地清该工作区读缓存，避免按钮点完还看到上一屏的 owner。
 */
export declare function registerWriteRoutes(webServer: WebServerLike, deps: RouteDeps): void;
export interface SessionRouteDeps {
    readonly registry: WorkspaceRegistryLike;
    /** 起会话的服务面；宿主缺就回 503 人话（端点照常注册，前端不用按版本分支）。 */
    readonly agents: AgentsLike | undefined;
    /** 惰性服务读取：`agentPresets` / `agentDefaultModel` 可能整条不存在，或被 ctx 的 inject 门挡住。 */
    readonly getService: (name: string) => unknown;
}
/**
 * 注册「结束任务」端点：`POST /close`。
 *
 * 为什么只有这一条走会话（2026-10-18 用户拍板）：认领 / 释放没有判断量，host 直写即可；
 * **结束**要带用户留言、要模型读过程文档后写真摘要 —— 只能交给会话里的 Agent 做。
 *
 * 请求体：`{ ws, id, message?, provider?, model? }`；响应：`{ sessionId, warning? }`。
 */
export declare function registerSessionRoutes(webServer: WebServerLike, deps: SessionRouteDeps): void;
