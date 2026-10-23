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
import { registerRoutes, registerSessionRoutes, registerWriteRoutes, } from "./host/routes.js";
import { buildSkillRegistration, } from "./host/skill/registration.js";
export const name = "dsh-task-ledger";
/**
 * 惰性服务读取：cordis ctx 的属性是 getter，**没 inject 的服务读一下就 throw**
 * （参考插件真机实证：`cannot get property "agentTeams" without inject`）。
 * 探测语义是「有就用、没有就降级」，所以把 throw 归一成 undefined。
 */
function readService(services, name) {
    try {
        return services[name];
    }
    catch {
        return undefined;
    }
}
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
        // 写端点（认领 / 释放）：B 混合制下由 host 直跑脚本，不依赖 agents ⇒ 与数据面同一条注入线。
        registerWriteRoutes(webServer, { registry });
        console.info("[task-ledger] 数据面路由已注册（读 /api/task-ledger/* + 写 /claim /release）");
    });
    // ── 会话交接（按钮侧「结束任务」，2026-10-18 拍板 B 案：只有结束走会话） ──
    // 单独一条注入线：agents 缺席只影响这一个端点，不该拖累数据面（上一条线只等 registry + webServer）。
    ctx.inject(["agents", "workspaceRegistry", "webServer"], (services) => {
        const registry = services.workspaceRegistry;
        const webServer = services.webServer;
        if (registry === undefined || webServer === undefined) {
            console.warn("[task-ledger] workspaceRegistry / webServer 未就位，「结束任务」端点不注册");
            return;
        }
        registerSessionRoutes(webServer, {
            registry,
            agents: services.agents,
            getService: (name) => readService(services, name),
        });
        console.info("[task-ledger] 「结束任务」端点已注册（POST /api/task-ledger/close）");
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
