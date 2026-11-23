/**
 * **唯一执行体**：起一个 agent 会话，并在需要时把结果变成一条服务端作业记录。
 *
 * 「继续」与「完成（交给 Agent 结案）」不是两条链路 —— 差别只有一个 `policy`：
 *  · `resume`：起会话，把只读汇报提示词注入，立刻返回（用户被带到会话里干活）。
 *  · `close` ：起会话 + 向任务中心登记一条作业 + 等它跑完 + **以台账为准**结算。
 *
 * 起会话的五步只写在这里（2026-11-03 核实的三条硬约束，缺一条就是「会话建了但没法干活」）：
 *  1. `setup` 里必须 `agentPresets.mount()` —— 不挂 preset 的 agent 落到空的全局层，fs / bash 全无；
 *  2. `agentOptions.provider/model` 必须成对显式给 —— 缺省**不等于**走宿主默认；
 *  3. 建完必须 `attachSession(sessionId)` —— 只设 `meta.cwd` 不会把会话归进工作区。
 *
 * 「跑完了」用宿主官方信号：`agent.whenIdle()`（`@deepseek-ai/dsh-agent@0.2.2-rc.3`
 * `lib/types/runtime-types.d.ts:192`「当前整段活动到达静止后兑现」）。**不订阅、不轮询、不设兜底定时器**。
 *
 * 判据的分工必须分清：
 *  · 本文件只回答「这一轮跑完没」；
 *  · 结没结成**以台账为准**（跑完再看一眼在办列表），不解析模型自述 —— 2026-11-03 定下的口径。
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { invalidate } from "../repositories/cache.js";
import { readTasks } from "../repositories/ledger.repository.js";
import { closeJobKey } from "./session-job.store.js";
/**
 * 比较用的规范化路径：registry 里存的是建工作区时的 `fs.realpath`，
 * 而台账目录可能是手工添加进来的（符号链接 / 相对写法）⇒ 直接用字符串比会误判成「非 DSH 工作区」。
 * realpath 失败（目录不在了）就退回原串，交给后续步骤按真实情况报错。
 */
function canonical(path) {
    try {
        return realpathSync(path);
    }
    catch {
        return path;
    }
}
/**
 * 判据：台账目录的 path 能不能在宿主工作区里找到实体。「继续」与「完成」共用这一条。
 *
 * 非 DSH 工作区**起不了会话**，只能退化成「把提示词复制给用户，让他去对应的 Agent 粘」。
 */
export function resolveWorkspace(registry, path) {
    const list = registry.list();
    const wanted = canonical(path);
    const workspace = list.find((item) => item.path === path) ??
        list.find((item) => canonical(item.path) === wanted);
    return workspace === undefined ? { kind: "not-dsh" } : { kind: "dsh", workspace };
}
function messageOf(prompt, source) {
    return {
        id: randomUUID(),
        role: "user",
        content: [{ type: "text", text: prompt }],
        // source 的 kind 与别的插件不冲突（合并扩展的判别字段），form/summary 只影响气泡上那行小字。
        source: { kind: "task-ledger", form: "notice", summary: source },
    };
}
/** 模型必须成对给：宿主缺省不填 `{{model}}` 会让 deployment persona 取不到值直接报错。 */
function resolveRoute(defaultModel) {
    if (defaultModel === undefined)
        return undefined;
    try {
        const route = defaultModel.currentSelection();
        if (typeof route?.provider === "string" &&
            route.provider !== "" &&
            typeof route.model === "string" &&
            route.model !== "")
            return { provider: route.provider, model: route.model };
    }
    catch {
        /* 宿主服务未挂载时读属性会抛：按"没有默认模型"处理，由调用方报人话 */
    }
    return undefined;
}
/** 部署默认 preset；解析不出按 rosterless 处理（那种部署的东西在全局层，不挂也看得见）。 */
async function resolvePresetId(presets) {
    if (presets === undefined)
        return undefined;
    try {
        const { id } = await presets.resolve();
        return id === "" ? undefined : id;
    }
    catch {
        return undefined;
    }
}
/**
 * 起会话并注入首条消息 —— **全仓唯一的起会话实现**。
 *
 * @throws Error（人话直上界面）：宿主缺 agents 服务 / 没有可用默认模型 / 会话建不起来 /
 *   建好了但归不进工作区（此时会话会被 dispose 掉，不留孤儿）。
 */
async function createSession(deps, input) {
    const agents = deps.agents;
    if (agents === undefined)
        throw new Error("宿主没有提供 agents 服务，起不了会话（本环境无法继续任务）。");
    const route = resolveRoute(deps.defaultModel);
    if (route === undefined)
        throw new Error("宿主没有可用的默认模型（provider + model 需成对），请先在宿主里选一个模型再继续。");
    const presetId = await resolvePresetId(deps.presets);
    // ① 建会话（禁止预建再驱动：撞 already exists）
    const sessionId = randomUUID();
    const handle = await agents.create({
        sessionId,
        meta: {
            cwd: input.workspace.path,
            ...(presetId === undefined ? {} : { agentPreset: presetId }),
        },
        agentOptions: route,
        setup: async (agentCtx) => {
            if (presetId === undefined || deps.presets === undefined)
                return;
            await deps.presets.mount(agentCtx, presetId);
        },
    });
    // ② 归组：不 attach 就只有 cwd，侧栏里找不到这个会话 ⇒ 宁可回滚也不留孤儿
    try {
        if (input.workspace.attachSession === undefined)
            throw new Error(`宿主没有提供 attachSession，会话 ${sessionId} 无法归入工作区「${input.workspace.title}」，已放弃。`);
        await input.workspace.attachSession(sessionId);
    }
    catch (error) {
        await handle.dispose().catch(() => { });
        throw error;
    }
    // ③ 命名：`sessionTitle.rename` 写的是「用户来源」标题（会锁定自动命名，正是我们要的稳定名字）。
    //    服务缺席 / 写失败都只丢标题，不能连累已经建好并归组的会话。
    if (deps.sessionTitle !== undefined) {
        try {
            deps.sessionTitle.rename(handle.agent.session, input.title);
        }
        catch {
            /* 命名失败不阻断 */
        }
    }
    // ④ 注入首条消息并唤醒 driver
    handle.agent.send(messageOf(input.prompt, input.source), "next-turn", true);
    return { sessionId, agent: handle.agent };
}
/** 会话起跑最多等这么久；超时说明唤醒没生效，按失败结算而不是无限挂着。 */
const TURN_START_TIMEOUT_MS = 15_000;
const TURN_START_POLL_MS = 100;
/**
 * 等这一轮跑完。
 *
 * 必须先见到 `running` 再等 `whenIdle()`：agent 刚建出来可能是 `idle`，
 * 直接等 idle 会立刻兑现（同旧实现「先见到 true 再变 false」的判据，理由不变）。
 */
async function waitTurnSettled(agent) {
    const deadline = Date.now() + TURN_START_TIMEOUT_MS;
    while (agent.status !== "running") {
        if (Date.now() > deadline)
            throw new Error("会话没有起跑（唤醒未生效）");
        await new Promise((resolve) => setTimeout(resolve, TURN_START_POLL_MS));
    }
    await agent.whenIdle();
}
/**
 * 看护一条结案作业直到终态。**故意不 await**：路由要在几秒内返回，作业自己跑它的。
 *
 * 结算判据（顺序固定）：
 *  1. 会话跑完（`whenIdle`）；
 *  2. 清读缓存后重读该台账的在办列表；
 *  3. 还在办 ⇒ `failed: still-open`；不在了 ⇒ `done`。
 *
 * 这一段是旧实现里「刷新即断」的根源 —— 现在它跑在宿主进程里，页面关掉也照跑。
 */
function watchCloseJob(deps, job) {
    void (async () => {
        try {
            await waitTurnSettled(job.agent);
        }
        catch (error) {
            deps.jobs.settle(job.key, "failed", {
                reason: error instanceof Error ? error.message : "session-error",
            });
            return;
        }
        // 会话刚写完台账，读缓存必须清掉，否则拿的是跑之前那份
        invalidate();
        try {
            const rows = await readTasks({
                id: job.workspace.id,
                title: job.workspace.title,
                path: job.workspace.path,
            });
            const stillOpen = rows.some((row) => row.id === job.taskId);
            deps.jobs.settle(job.key, stillOpen ? "failed" : "done", {
                ...(stillOpen ? { reason: "still-open" } : {}),
                result: { sessionId: job.sessionId },
            });
        }
        catch {
            /* 台账读不到 ⇒ 不谎报成功，按失败结算 */
            deps.jobs.settle(job.key, "failed", { reason: "ledger-unreadable" });
        }
    })();
}
function sessionIdOf(record) {
    const detail = record.detail;
    if (detail === null || typeof detail !== "object")
        return null;
    const value = detail.sessionId;
    return typeof value === "string" ? value : null;
}
/**
 * 唯一入口：起会话（+ 需要时登记并看护作业）。
 *
 * @throws Error（人话直上界面）：见 `createSession` 的三条。
 */
export async function startSession(deps, input) {
    // ① 判据：台账目录的 path 能不能在宿主工作区里找到实体
    const resolved = resolveWorkspace(deps.registry, input.workspace);
    if (resolved.kind === "not-dsh")
        return { kind: "not-dsh" };
    const workspace = resolved.workspace;
    // ② 判重：原子占位先于 await createSession —— 两个标签页并发点同一任务的「交给 Agent」，
    //    只有一个能拿到 key，杜绝「都判无作业 → 各起一个会 race 覆盖」的 TOCTOU。
    const key = closeJobKey(input.taskId);
    if (input.policy === "close") {
        const existing = deps.jobs.find(key);
        if (existing !== undefined && existing.state === "running") {
            const sessionId = sessionIdOf(existing);
            if (sessionId !== null)
                return { kind: "duplicate", sessionId };
        }
        if (!deps.jobs.claim(key, input.title)) {
            const held = deps.jobs.find(key);
            const sessionId = held === undefined ? null : sessionIdOf(held);
            return { kind: "duplicate", sessionId: sessionId ?? "" };
        }
    }
    // ③ 起会话（可能耗时数秒；close 分支的 key 已在上面占住，并发进不来）
    let created;
    try {
        created = await createSession(deps, {
            workspace,
            title: input.title,
            prompt: input.prompt,
            source: input.policy === "close" ? `结案任务 ${input.taskId}` : `继续任务 ${input.taskId}`,
        });
    }
    catch (error) {
        if (input.policy === "close")
            deps.jobs.release(key);
        throw error;
    }
    // ④ 只有「完成」产生后台作业；「继续」是用户自己进去干，不登记
    if (input.policy === "close") {
        deps.jobs.register({
            key,
            title: input.title,
            sessionId: created.sessionId,
            taskId: input.taskId,
            workspace: workspace.path,
            ...(input.origin === undefined ? {} : { origin: input.origin }),
            ...(input.panelId === undefined ? {} : { panelId: input.panelId }),
        });
        watchCloseJob(deps, {
            key,
            sessionId: created.sessionId,
            taskId: input.taskId,
            workspace,
            agent: created.agent,
        });
    }
    return { kind: "started", sessionId: created.sessionId };
}
