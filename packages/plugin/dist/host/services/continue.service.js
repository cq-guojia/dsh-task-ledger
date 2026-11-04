/**
 * 「继续」：在**该台账所属的 DSH 工作区**里起一个新会话，把只读提示词作为首条 user message 注入。
 *
 * 为什么不塞进现有会话的输入框（2026-11-03 核实）：写草稿的 `setDraft` 只挂在会话作用域的门面上
 * （`dsh-client-ui-conversation` `contract/input.d.ts:165`，经 `SessionInputResolver.for(actx)` 取），
 * 根级 client 插件拿不到某个会话的 `actx`；按 id 取的 `input.shell()` 是包内部件。
 * 且任务↔会话之间没有绑定字段 ⇒「往哪个会话塞」本身没有答案。链路事实见
 * `docs/design/external/dsh-session-handoff.md`，兄弟插件实证 `dsh-task-dispatch-table/src/dispatch.ts:519/562/627`。
 *
 * 三条硬约束（宿主 rc 线的坑，缺一条就是"会话建了但没法干活"）：
 *  1. `setup` 里必须 `agentPresets.mount()` —— 不挂 preset 的 agent 落到空的全局层，fs / bash 全无；
 *  2. `agentOptions.provider/model` 必须成对显式给 —— 缺省**不等于**走宿主默认；
 *  3. 建完必须 `attachSession(sessionId)` —— 只设 `meta.cwd` 不会把会话归进工作区。
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
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
 * 判据：台账目录的 path 能不能在宿主工作区里找到实体。
 *
 * 「继续」和「完成」两条链都先过这一关 —— 非 DSH 工作区**起不了会话**，
 * 只能退化成「把提示词复制给用户，让他去对应的 Agent 粘」。
 */
export function resolveWorkspace(registry, path) {
    const list = registry.list();
    const wanted = canonical(path);
    const workspace = list.find((item) => item.path === path) ??
        list.find((item) => canonical(item.path) === wanted);
    return workspace === undefined ? { kind: "not-dsh" } : { kind: "dsh", workspace };
}
function continueMessage(id, prompt) {
    return {
        id: randomUUID(),
        role: "user",
        content: [{ type: "text", text: prompt }],
        // source 的 kind 与别的插件不冲突（合并扩展的判别字段），form/summary 只影响气泡上那行小字。
        source: { kind: "task-ledger", form: "notice", summary: `继续任务 ${id}` },
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
 * 起会话并注入只读提示词。
 *
 * @throws Error（人话直上界面）：宿主缺 agents 服务 / 没有可用默认模型 / 会话建不起来 /
 *   建好了但归不进工作区（此时会话会被 dispose 掉，不留孤儿）。
 */
export async function continueTask(deps, input) {
    // ① 判据：台账目录的 path 能不能在宿主工作区里找到实体 —— 找不到就是非 DSH 工作区。
    const resolved = resolveWorkspace(deps.registry, input.workspaceId);
    if (resolved.kind === "not-dsh")
        return { kind: "not-dsh" };
    const workspace = resolved.workspace;
    const agents = deps.agents;
    if (agents === undefined)
        throw new Error("宿主没有提供 agents 服务，起不了会话（本环境无法继续任务）。");
    const route = resolveRoute(deps.defaultModel);
    if (route === undefined)
        throw new Error("宿主没有可用的默认模型（provider + model 需成对），请先在宿主里选一个模型再继续。");
    const presetId = await resolvePresetId(deps.presets);
    // ② 建会话（禁止预建再驱动：撞 already exists）
    const sessionId = randomUUID();
    const handle = await agents.create({
        sessionId,
        meta: {
            cwd: workspace.path,
            ...(presetId === undefined ? {} : { agentPreset: presetId }),
        },
        agentOptions: route,
        setup: async (agentCtx) => {
            if (presetId === undefined || deps.presets === undefined)
                return;
            await deps.presets.mount(agentCtx, presetId);
        },
    });
    // ③ 归组：不 attach 就只有 cwd，侧栏里找不到这个会话 ⇒ 宁可回滚也不留孤儿
    try {
        if (workspace.attachSession === undefined)
            throw new Error(`宿主没有提供 attachSession，会话 ${sessionId} 无法归入工作区「${workspace.title}」，已放弃。`);
        await workspace.attachSession(sessionId);
    }
    catch (error) {
        await handle.dispose().catch(() => { });
        throw error;
    }
    // ④ 注入首条消息并唤醒 driver
    handle.agent.send(continueMessage(input.id, input.prompt), "next-turn", true);
    return { kind: "started", sessionId };
}
