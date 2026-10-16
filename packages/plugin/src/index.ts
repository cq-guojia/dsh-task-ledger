/**
 * dsh-task-ledger host 半入口：装配层，不写业务逻辑。
 *
 * 本期（任务 3「后端方法抽象」）只接只读数据面（routes.ts）。
 * skill 注册（任务 2）、入口 / 图标 / 设置页（任务 1）、按钮会话交接（任务 4）
 * 各自落地时再往本文件加装配，业务逻辑一律进 host/ 对应文件。
 *
 * 服务等待写在 apply 内的 ctx.inject（参考插件真机教训：顶层 inject 声明组合
 * 满足不了的依赖会令 entry 一直 pending、卡死整个 dsh 启动）。
 */
import { registerRoutes, type WebServerLike, type WorkspaceRegistryLike } from './host/routes.js'

export const name = 'dsh-task-ledger'

/** 浏览器 / 宿主插件上下文的最小面（结构声明，不 import 官方包）。 */
interface PluginContext {
  inject(deps: readonly string[], callback: (ctx: Record<string, unknown>) => void): void
}

export function apply(ctx: PluginContext): void {
  ctx.inject(['workspaceRegistry', 'webServer'], (services) => {
    const registry = services.workspaceRegistry as WorkspaceRegistryLike | undefined
    const webServer = services.webServer as WebServerLike | undefined
    if (registry === undefined || webServer === undefined) {
      console.warn('[task-ledger] workspaceRegistry / webServer 未就位，数据面路由不注册')
      return
    }
    registerRoutes(webServer, { registry })
    console.info('[task-ledger] 数据面路由已注册（/api/task-ledger/*）')
  })
}
