/**
 * dsh-task-ledger host 半入口：装配层，不写业务逻辑。
 *
 * 已落地：数据面路由（任务 3，routes.ts）、内嵌 skill 全局注册（任务 2，
 * skill-registration.ts）。入口 / 图标 / 设置页（任务 1）与按钮会话交接
 * （任务 4）各自落地时再往本文件加装配，业务逻辑一律进 host/ 对应文件。
 *
 * 服务等待写在 apply 内的 ctx.inject（参考插件真机教训：顶层 inject 声明组合
 * 满足不了的依赖会令 entry 一直 pending、卡死整个 dsh 启动）；两条注入线
 * 互相独立——skills 缺席不挡数据面，反之亦然。
 */
import { registerRoutes, } from "./host/routes.js";
import { buildSkillRegistration, } from "./host/skill/registration.js";
export const name = "dsh-task-ledger";
export function apply(ctx) {
    // ── 数据面（任务 3） ──
    ctx.inject(["workspaceRegistry", "webServer"], (services) => {
        const registry = services.workspaceRegistry;
        const webServer = services.webServer;
        if (registry === undefined || webServer === undefined) {
            console.warn("[task-ledger] workspaceRegistry / webServer 未就位，数据面路由不注册");
            return;
        }
        registerRoutes(webServer, { registry });
        console.info("[task-ledger] 数据面路由已注册（读 /api/task-ledger/workspaces、/board/snapshot）");
    });
    // ── skill 全局注册（任务 2） ──
    // unscoped 注册落全局层，模型可 load；disposer 随插件 dispose 自动注销。
    ctx.inject(["skills"], (services) => {
        const skills = services.skills;
        if (skills === undefined || typeof skills.register !== "function") {
            console.warn("[task-ledger] skills 服务未就位，内嵌 skill 不注册（数据面不受影响）");
            return;
        }
        ctx.effect(() => {
            const registration = buildSkillRegistration();
            const dispose = skills.register(registration);
            console.info(`[task-ledger] 已注册内嵌 skill：${registration.name}（正文 ${registration.content.length} 字）`);
            return dispose;
        });
    });
}
