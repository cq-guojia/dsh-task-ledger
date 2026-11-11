/**
 * dsh-task-ledger host 半入口：装配层，不写业务逻辑。
 *
 * 已落地：数据面路由（任务 3，routes.ts）、内嵌 skill 全局注册（任务 2，
 * skill-registration.ts）、插件配置 schema（`Config`，宿主托管的设置区）、
 * 只读文件路由。按钮会话交接（任务 4）落地时再往本文件加装配，业务逻辑一律进
 * host/ 对应文件。
 *
 * 服务等待写在 apply 内的 ctx.inject（参考插件真机教训：顶层 inject 声明组合
 * 满足不了的依赖会令 entry 一直 pending、卡死整个 dsh 启动）；两条注入线
 * 互相独立——skills 缺席不挡数据面，反之亦然。
 */
import { serveFsRoute } from "dsh-plugin-core/host";
import { FS_ROUTE, registerRoutes } from "./host/routes.js";
import { installRulesInjection } from "./host/services/rules-injection.service.js";
import { buildSkillRegistration, } from "./host/skill/registration.js";
export const name = "dsh-task-ledger";
/**
 * 取官方 schema 库。**动态 import + 兜底**而不是静态 import：静态 import 一旦解析不到，
 * 整个 server entry 加载失败，插件管理页把它标成「异常」——连侧栏与整页一起没了
 * （dsh-plugin-core demo 2026-10-25 真机事故的同一坑）。退化成 undefined 的代价只是
 * 「详情页没有配置区」，入口照常可用。
 */
async function loadSchemastery() {
    try {
        return (await import("@deepseek-ai/schemastery")).default;
    }
    catch {
        return undefined;
    }
}
const z = await loadSchemastery();
if (z === undefined)
    console.warn("[task-ledger] @deepseek-ai/schemastery 解析失败：插件详情页没有配置区（侧栏入口与看板不受影响）");
/**
 * 插件配置 schema —— 插件详情页配置区的唯一来源（dsh 0.1.7+：settings 服务按活跃
 * entry 的 `Config` 派生表单，命名空间 = `cordis.patch.yml` 那条 insert 的 id = 包名）。
 *
 * · 只有 `.volatile()` 字段会进表单，且由宿主**原位热更新 + 持久化**（写到 profile
 *   patch 文档）；插件不自己落盘、不碰 localStorage。
 * · `entryMode`：`first` = 左侧第一级（默认，= 既有位置）/ `more` = 「更多」菜单。
 * · `displayName`：空串 = 用词典里的默认名（见 client/locales.ts 的 `panelTitle`）。
 *
 * 刻意不带 `z<Config>` 类型标注：`.volatile()` 改变推导类型，带上反而 TS2322。
 */
export const Config = z === undefined
    ? undefined
    : z.object({
        entryMode: z.string().default("first").volatile(),
        displayName: z.string().default("").volatile(),
    });
/**
 * 「继续」用的宿主服务读取器：**现取、不预先注入**。
 *
 * 为什么不写进 `ctx.inject([...])` 的依赖表：cordis 里任一依赖缺席，整个回调永远 pending，
 * 数据面会跟着一起消失（参考插件真机教训）。这些服务缺席只该让「继续」这一个动作报人话。
 * 另外 ctx 的命名空间属性是 getter，未 inject 时读取直接 throw ⇒ 这里归一成 undefined。
 */
function serviceOf(ctx, name) {
    return () => {
        try {
            return ctx.get(name);
        }
        catch {
            return undefined;
        }
    };
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
        registerRoutes(webServer, {
            registry,
            // 「继续」要起会话：agents / agentPresets / agentDefaultModel 三者按需现取
            agents: serviceOf(ctx, "agents"),
            presets: serviceOf(ctx, "agentPresets"),
            defaultModel: serviceOf(ctx, "agentDefaultModel"),
            sessionTitle: serviceOf(ctx, "sessionTitle"),
        });
        console.info("[task-ledger] 数据面路由已注册（读 /api/task-ledger/workspaces、/board/snapshot；写 /task/action、/task/continue）");
    });
    // ── 只读文件路由（核心 explorer 的数据面：选目录弹窗 + 文件预览都吃它） ──
    // 官方 workspaceFiles 只能在各自工作区内列目录，选台账目录要能走全盘 ⇒ 用核心这条。
    serveFsRoute(ctx, { path: FS_ROUTE });
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
    // 会话规则注入：监听 pre-step，开关由插件自有设置文件控制（无设置文件时默认开）
    installRulesInjection(ctx);
}
