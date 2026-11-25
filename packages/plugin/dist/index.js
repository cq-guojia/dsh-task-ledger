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
import { serveFsRoute, serveTaskStream, serveTaskSubmit } from "dsh-plugin-core/host";
import { formatDisplayTitle, isDisplayTitle } from "dsh-plugin-core/adv/tasks";
import { FS_ROUTE, TASK_CENTER_ROUTE, TASK_CENTER_VIEWER, registerRoutes, } from "./host/routes.js";
import { startSession } from "./host/services/session.service.js";
import { startWriteJob, isWriteJobTexts, isCompletionTexts, } from "./host/services/write-job.service.js";
import { checkHistoryDelete, parseDeleteHistKey, } from "./host/services/task-action-params.js";
import { installRulesInjection } from "./host/services/rules-injection.service.js";
import { createSessionJobStore } from "./host/services/session-job.store.js";
import { installSessionProgress, isCloseProgressTexts, } from "./host/services/session-progress.service.js";
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
        // 会话作业的状态真源：一份实例同时喂给命令路由与任务中心路由。
        // 进程内存储，随插件 dispose 释放（宿主重启 ⇒ 会话已断 ⇒ 记录本就该消失）。
        // 结案归档在服务端终态漏斗里做（不依赖客户端订阅是否还在）；宿主没这能力就只跳过归档。
        const jobs = createSessionJobStore(registry.archiveSession === undefined
            ? undefined
            : (sessionId) => registry.archiveSession(sessionId, { stopActivity: true }));
        ctx.effect(() => () => {
            jobs.dispose();
        });
        // 阶段披露源：宿主会话事件 → jobs.reportProgress（单一写入口）；不落盘、不轮询。
        const progress = installSessionProgress(ctx, jobs);
        ctx.effect(() => () => {
            progress.dispose();
        });
        // 起会话要用的宿主服务：现取、不预注入（缺席只让该动作报人话，不拖垮数据面）
        const getAgents = serviceOf(ctx, "agents");
        const getPresets = serviceOf(ctx, "agentPresets");
        const getDefaultModel = serviceOf(ctx, "agentDefaultModel");
        const getSessionTitle = serviceOf(ctx, "sessionTitle");
        registerRoutes(webServer, {
            registry,
            agents: getAgents,
            presets: getPresets,
            defaultModel: getDefaultModel,
            sessionTitle: getSessionTitle,
            jobs,
            progress,
        });
        // submit 回调要的是「值」形状（SessionDeps），每次现取，跟路由共用同一组 getter。
        const sessionDeps = () => ({
            registry,
            agents: getAgents(),
            presets: getPresets(),
            defaultModel: getDefaultModel(),
            sessionTitle: getSessionTitle(),
            jobs,
            progress,
        });
        // 任务中心：服务端权威三件套由核心挂，本插件只给状态源与提交回调。
        // authorize：本机单用户、工作区之间无权限边界 ⇒ 固定 viewer / true。
        const offStream = serveTaskStream(ctx, {
            basePath: TASK_CENTER_ROUTE,
            authorize: () => TASK_CENTER_VIEWER,
            source: jobs,
        });
        const offSubmit = serveTaskSubmit(ctx, {
            path: `${TASK_CENTER_ROUTE}/submit`,
            authorize: () => true,
            onSubmit: async (payload) => {
                const key = typeof payload.key === "string" ? payload.key : "";
                const kind = typeof payload.kind === "string" ? payload.kind : "";
                const args = (payload.args ?? {});
                const workspace = typeof args.workspace === "string" ? args.workspace : "";
                // 核心 v0.46.0 起 startTask.title 是 DisplayTitle；string 帧会被 isTaskRecord 拒收，
                // 所以这里按结构校验，缺了就拒绝提交，不让服务端落一条永远显示不出来的幽灵作业。
                if (!isDisplayTitle(payload.title))
                    throw new Error("提交缺结构化任务标题");
                const displayTitle = payload.title;
                const origin = typeof payload.origin === "string" ? payload.origin : undefined;
                const panelId = typeof payload.panelId === "string" ? payload.panelId : undefined;
                // 摘要 / 留言与旧路由同口径：trim + 截 200，历史行不该被一段小作文撑开。
                const summary = typeof args.summary === "string" ? args.summary.trim().slice(0, 200) : "";
                // key 前缀决定动作对象：在办任务取任务号，历史行删除取 src/line。
                // key 与 kind 必须配套，防止前端拼错导致「A 动作的 key 跑 B 命令」。
                const prefixed = (prefix) => key.startsWith(prefix) && key.slice(prefix.length) !== ""
                    ? key.slice(prefix.length)
                    : null;
                const taskId = kind === "close-agent" || kind === "close-direct"
                    ? prefixed("close:")
                    : kind === "release"
                        ? prefixed("release:")
                        : kind === "cancel"
                            ? prefixed("cancel:")
                            : kind === "delete"
                                ? prefixed("delete:")
                                : null;
                const histLocation = kind === "delete-hist" ? parseDeleteHistKey(key) : null;
                if (taskId === null && histLocation === null)
                    throw new Error("提交 key 与 kind 不匹配，已拒绝");
                // agent 结案：起会话，走 session.service（唯一不写台账的提交分支）。
                if (kind === "close-agent") {
                    if (taskId === null)
                        throw new Error("提交缺 close:<任务号> key");
                    const prompt = typeof args.prompt === "string" ? args.prompt : "";
                    const title = typeof args.title === "string" ? args.title : formatDisplayTitle(displayTitle);
                    const buttonText = typeof args.buttonText === "string" ? args.buttonText : undefined;
                    if (!isCloseProgressTexts(args.progressTexts))
                        throw new Error("提交缺阶段披露文案");
                    const reply = await startSession(sessionDeps(), {
                        workspace,
                        taskId,
                        policy: "close",
                        title,
                        displayTitle,
                        prompt,
                        ...(buttonText === undefined ? {} : { buttonText }),
                        progressTexts: args.progressTexts,
                        ...(origin === undefined ? {} : { origin }),
                        ...(panelId === undefined ? {} : { panelId }),
                    });
                    if (reply.kind === "not-dsh")
                        throw new Error("台账目录不是宿主工作区，起不了会话");
                }
                else if (kind === "close-direct" ||
                    kind === "release" ||
                    kind === "cancel" ||
                    kind === "delete" ||
                    kind === "delete-hist") {
                    // 其余四种写命令共用一套通用后台执行体；action 由 kind 显式映射。
                    if (!isWriteJobTexts(args.progressTexts))
                        throw new Error("提交缺写命令阶段披露文案");
                    const action = kind === "close-direct"
                        ? "close"
                        : kind === "delete-hist"
                            ? "delete"
                            : kind;
                    // 历史行删除的参数在**提交期**校验：旧路由的同一套规则一字不差复用，
                    // 否则错误会从「提交期可见」退化成「后台跑完 git 才失败」。
                    let history;
                    if (kind === "delete-hist") {
                        if (histLocation === null)
                            throw new Error("历史删除 key 不合法");
                        const fingerprint = typeof args.fingerprint === "string" ? args.fingerprint.trim() : "";
                        const checked = checkHistoryDelete(histLocation.src, histLocation.line, fingerprint);
                        if (!checked.ok)
                            throw new Error(`历史删除参数不合法：${checked.reason}`);
                        history = checked.value;
                    }
                    // 三个新动作必带终态文案；直接结案沿用 store 默认，可不带。
                    // 带了就一律校验形状，畸形值不许透传给核心 toast（否则终态显示坏文案）。
                    const completionTexts = isCompletionTexts(args.completionTexts)
                        ? args.completionTexts
                        : undefined;
                    if (kind !== "close-direct" && completionTexts === undefined)
                        throw new Error("提交缺终态文案");
                    const reply = await startWriteJob({ jobs }, {
                        key,
                        kind,
                        action,
                        title: displayTitle,
                        texts: args.progressTexts,
                        ...(completionTexts === undefined ? {} : { completionTexts }),
                        workspace,
                        taskId: taskId ?? "",
                        summary,
                        ...(history === undefined ? {} : { history }),
                        ...(origin === undefined ? {} : { origin }),
                        ...(panelId === undefined ? {} : { panelId }),
                    });
                    if (reply.kind === "not-found")
                        throw new Error("找不到这个台账目录，写不了台账");
                }
                else {
                    throw new Error(`不支持的后台作业类型：${kind}`);
                }
                const record = jobs.find(key);
                if (record === undefined)
                    throw new Error("作业登记失败");
                return record.id;
            },
        });
        ctx.effect(() => () => {
            offStream();
            offSubmit();
        });
        console.info("[task-ledger] 数据面路由已注册（读 /api/task-ledger/board/snapshot 等；作业流 /task-center/stream、提交 /task-center/submit）");
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
