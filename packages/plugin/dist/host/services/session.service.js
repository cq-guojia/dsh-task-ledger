/**
 * 会话交接（按钮侧方法层）：把一条任务交给模型去收尾。
 *
 * 事实（[`external/dsh-session-handoff.md`](../../../../docs/design/external/dsh-session-handoff.md)）：
 * 浏览器半**没有**「往会话里发自由文本」的官方 API，唯一链路 = host `ctx.agents.create()` 自建会话
 * + `agent.send()` 发预置提示词，客户端再 `openSession` 跳过去。
 *
 * 两条硬约束（都是参考插件真机踩出来的，不是猜的）：
 * ① **必须带 preset**：`create` 里不 mount preset 的 agent 落到「空的全局层」——只剩根作用域的东西，
 *    fs / bash 全无，模型连 `progress.py` 都跑不起来 ⇒ 这种会话建了等于白建。
 * ② **provider + model 必须成对显式给**：缺省**不是**「走宿主默认路由」。用户没选模型时，
 *    这里按宿主 `agentDefaultModel.currentSelection()` 取部署默认；取不到就报 503，不建半个会话。
 *
 * 本文件只管「结束任务」这一条（2026-10-18 用户拍板：认领 / 释放由 host 直写、不开会话；
 * 结束要走会话，因为要带用户留言、要模型读过程文档后写摘要）。
 */
import { randomUUID } from "node:crypto";
import { getTask } from "../repositories/ledger.repository.js";
import { SKILL_SCRIPT } from "../skill/registration.js";
export class HandoffError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "HandoffError";
    }
}
/**
 * 「结束任务」提示词（2026-10-18 用户口述定稿）。
 *
 * 结构照用户原话：**预置说明在前，用户留言放最末**（越靠后、越只讲一件事的段落遵守率越高 ——
 * 参考插件真机结论）。三道硬约束缺一不可：
 * ① 不要开新会话（用户：我要结束这个流程了，不能让模型再开一堆框）；
 * ② 读过程文档后直接收尾（别再回头问，用户已经留言了）；
 * ③ 写台账只经 skill 脚本（插件不手改文件，close 由模型执行）。
 */
export function buildClosePrompt(input) {
    const worklog = input.worklogPath === null || input.worklogPath === ""
        ? "（这条任务没有登记过程文档）"
        : `${input.workspacePath}/ledger/${input.worklogPath}`;
    const message = input.message.trim() === ""
        ? "（用户没有留具体内容）"
        : input.message.trim();
    return [
        `用户从任务台账看板点了「结束」，要把任务「${input.title}」（任务号 ${input.taskId}）结案。`,
        "",
        `工作区：${input.workspacePath}`,
        `过程文档：${worklog}`,
        "",
        "请按顺序做完这三件，然后停下：",
        "1. 读过程文档的「背景 / 待办 / 下一步」，核对这次到底做了什么、还留了什么坑。",
        `2. 用 task-ledger skill 的脚本结案（在工作区目录下、原样执行这一条命令）：`,
        `   ${SKILL_SCRIPT} close --id ${input.taskId} --repo ${input.workspacePath} --summary "<一句话说清做成了什么、留了什么坑>"`,
        "   `--summary` 是必填参数，不许编套话；命令报错就原样报告错误，不要自己绕过、不要手改台账文件。",
        "3. 收尾即结束——这就是本条消息的全部要求。",
        "",
        "【硬约束】",
        "- 不要在会话里继续派活，**不要新建会话或子 agent**：这是收尾动作，不是新任务的开始。",
        "- 用户已经明确要结束，不会再回答提问：信息不足就按留言与过程文档如实写进摘要/结论，**不要停下来反问**。",
        "- 只动这一个任务，不顺带改别的记录；写台账只经上面那个 skill 脚本。",
        "",
        "用户现在处理结束，以下是用户的留言：",
        message,
    ].join("\n");
}
/**
 * 起一个「结束任务」会话并发出首条提示词。
 * 失败抛 {@link HandoffError}（带原因码）；成功返回 sessionId 供客户端 `openSession` 跳转。
 */
export async function startCloseSession(deps, request) {
    const agents = deps.agents;
    if (agents === undefined) {
        throw new HandoffError("no-agents", "宿主未暴露 agents 服务，起不了会话（按钮交接暂不可用）");
    }
    const presets = deps.presets;
    if (presets === undefined) {
        throw new HandoffError("no-preset", "宿主未暴露 agentPresets 服务：起出来的会话没有 fs / bash 工具，模型跑不了 close");
    }
    const route = resolveModelRoute(deps.defaultModel, request.model);
    // 任务此刻必须还在在办里（刚被别处结案 ⇒ 明确告知，不拿空标题去建会话）。
    const task = await getTask(request.workspace, request.taskId);
    if (task === null) {
        throw new HandoffError("task-missing", `任务 ${request.taskId} 不在「${request.workspace.title}」的在办列表里（可能已被结案）`);
    }
    let presetId;
    try {
        presetId = (await presets.resolve()).id;
    }
    catch (error) {
        throw new HandoffError("no-preset", `解析默认 preset 失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const sessionId = randomUUID();
    let handle;
    try {
        handle = await agents.create({
            sessionId,
            // cwd 必须是该工作区真实路径（会话 header 校验 + 工作区归组都按它判）。
            meta: { cwd: request.workspace.path, agentPreset: presetId },
            agentOptions: { provider: route.provider, model: route.model },
            // setup 是发布前唯一能挂工具 / prompt sections / skill 的时机；抛错则整个作用域回滚。
            setup: async (agentCtx) => {
                await presets.mount(agentCtx, presetId);
            },
        });
    }
    catch (error) {
        throw new HandoffError("create-failed", `会话没建起来（preset=${presetId}）：${error instanceof Error ? error.message : String(error)}`);
    }
    const prompt = buildClosePrompt({
        title: task.title ?? request.taskId,
        taskId: request.taskId,
        workspacePath: request.workspace.path,
        worklogPath: task.worklog ?? null,
        message: request.message,
    });
    try {
        handle.agent.send({
            id: randomUUID(),
            role: "user",
            content: [{ type: "text", text: prompt }],
            source: {
                kind: "task-ledger",
                form: "notice",
                summary: `结束任务 · ${task.title ?? request.taskId}`,
            },
        }, "next-turn", true);
    }
    catch (error) {
        throw new HandoffError("send-failed", `会话已建（${sessionId}）但首条消息没发出去：${error instanceof Error ? error.message : String(error)}`);
    }
    return { sessionId };
}
/**
 * 模型路由：用户选了就必须给全一对（只有一半 = 配错，直接人话拒绝）；
 * 没选就走宿主部署默认。**没有兜底猜测**——猜一个模型去结案比报错更糟。
 */
export function resolveModelRoute(defaultModel, explicit) {
    if (explicit !== undefined) {
        if (explicit.provider === "" || explicit.model === "") {
            throw new HandoffError("no-model", "provider 与 model 必须成对给出（只给一半会被拒，不做猜测）");
        }
        return explicit;
    }
    if (defaultModel !== undefined) {
        try {
            const route = defaultModel.currentSelection();
            if (route.provider !== "" && route.model !== "")
                return { provider: route.provider, model: route.model };
        }
        catch {
            /* 读不到就往下走，报同一句人话 */
        }
    }
    throw new HandoffError("no-model", "宿主没有可用的默认模型：请在请求里给出 provider + model");
}
