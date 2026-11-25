/**
 * 会话作业的**状态唯一真源**：核心 `TaskStreamSource` 的本仓实现（2026-11-21 按 v0.43.8 重写）。
 *
 * 为什么住宿主进程：作业的执行者在宿主（agent 会话由宿主建、由宿主驱动），状态寿命 = 执行者寿命。
 * 页面只是订阅者，刷新 / 关页 / 换标签页都不影响这里的一行记录。
 *
 * 新协议（v0.43.8）与旧 `TaskCenterStore` 的区别：
 *  - 核心只认三件事：`snapshot(viewer)` 基线、`subscribe(listener, viewer)` 状态投影、
 *    `subscribeNotices(listener, viewer)` 一次性终态通知；旧六方法 + 租约 / 令牌 / tombstone 全删。
 *  - 记录形状换成核心 `TaskRecord`；终态必须带有限数 `settledAt`，running 不得带（核心唯一闸）。
 *  - 通知与状态物理隔离：状态可重放不弹卡；只有终态跃迁那一刻产出带全局 id 的 notice 进 outbox，
 *    订阅时回放未过期 outbox（断线期间结算的也能补投），客户端按 id 永久去重。
 *  - 回显 `project` / `group` / `key`：客户端靠 `(project,key)` 把乐观行归一到服务端真记录。
 *
 * 本文件只管状态：不建会话、不读台账。业务在 `session.service.ts`。
 */
import { randomUUID } from "node:crypto";
/** 任务中心的一级项目名（与客户端 `TASK_PROJECT` 必须是同一个值）。 */
export const PROJECT = "dsh-task-ledger";
/** 二级分组：本插件只有「会话作业」一类后台任务，不按用途再分。 */
export const GROUP = "session";
/** 「查看会话」按钮 id（客户端 mountTaskUI 的 handler 按它注册）。 */
export const VIEW_SESSION_ACTION = "view-session";
const SECOND = 1_000;
/** 终态记录与通知保留多久：只服务 UI 收尾与跨页去重，过期即清（不是业务数据）。 */
const TERMINAL_TTL_MS = 10 * 60 * SECOND;
/** 看护轮询间隔：只处理「超过 maxDurationMs 还在跑」这一种情况。 */
const REAP_INTERVAL_MS = 5 * SECOND;
function keyOf(project, key) {
    return `${project}\u0000${key}`;
}
/** 行按钮：服务端只声明文案 / 图标 / 时机 / id，画面由核心 TaskBar 画，handler 在发起页注册。 */
function rowButtons(kind) {
    // 只有 agent 结案有会话可看；其余动作不挂按钮，免得画一个点了没反应的死按钮。
    return kind === "close-agent"
        ? [{ id: VIEW_SESSION_ACTION, text: "查看会话", icon: "common.base:AIdamoxing", when: "always" }]
        : [];
}
/** toast 按钮：与行按钮同一个 id，点击走同一处 handler（开会话视图）。文案由客户端按界面语言传。 */
function toastButton(text) {
    return { id: VIEW_SESSION_ACTION, text, icon: "common.base:AIdamoxing" };
}
/** 从作业 detail 取会话 id（与客户端 sessionIdOfDetail 同口径）。 */
function sessionIdOf(detail) {
    if (detail === null || typeof detail !== "object" || Array.isArray(detail))
        return null;
    const value = detail.sessionId;
    return typeof value === "string" ? value : null;
}
/** 把结算 result 并进 detail（detail 是 JSON 值，只有普通对象能就地加键）。 */
function withResult(detail, result) {
    if (detail !== null && typeof detail === "object" && !Array.isArray(detail)) {
        return { ...detail, result };
    }
    return { ...(detail === undefined ? {} : { detail }), result };
}
/**
 * 失败原因压成一句可塞进 toast 的短句：skill 的错误原文常带任务号 / 路径 / 换行「处理：」段，
 * 全搬进 toast 会把人话淹没。规则：只取第一行、抽掉可变标识、去句尾标点、截到 24 字。
 * 只做无语义的裁剪，不翻译也不造词；TaskRecord.reason 仍保留完整原文供排查。
 */
function shortenReason(reason) {
    const firstLine = reason.split("\n", 1)[0] ?? "";
    const short = firstLine
        .replace(/\d{8}-\d{4}-[0-9a-z]+-[^\s，。；]+/gi, "") // 任务号
        .replace(/[\w./\\-]+\.(?:md|json|lock)/gi, "") // 文件路径
        .replace(/[（(][^）)]*\d+[^）)]*[）)]/g, "") // 含数字的括号补充（如「已等 120 秒」）
        .replace(/(?:，|、)?(?:已中止、?)?(?:未写入任何内容|未做任何写入)/g, "") // 零写入尾注（toast 不必说）
        .replace(/\s+/g, "") // 抽掉任务号 / 路径后的空格
        .replace(/[，。；,;]+$/, "");
    return short.length > 24 ? `${short.slice(0, 24)}…` : short;
}
/** 失败时在 toast 后缀里补上短原因：把 `xxx（失败后缀）` 改写成 `xxx（失败：短原因）`。 */
function withFailureReason(toast, reason) {
    const failure = toast?.failure;
    const title = failure?.title;
    if (title === undefined)
        return toast;
    const short = shortenReason(reason);
    if (short === "")
        return toast;
    // description 形如「测试一（删除失败，请稍后重试）」⇒ 收成「测试一（失败：短原因）」，
    // 不重复「请稍后重试」；taskName 从结构化 title 的 description 取，但这里已有括号，
    // 故用第一个左括号切出任务名部分（标题也可能自带括号，取最后一个「（失败」之前的段）。
    const at = title.description.lastIndexOf("（");
    const taskName = at >= 0 ? title.description.slice(0, at) : title.description;
    return {
        ...toast,
        failure: { ...failure, title: { ...title, description: `${taskName}（失败：${short}）` } },
    };
}
/** toast / notify 配置随记录走：任何页面看到同一条都按同一份配置渲染。
 *  文案要能独立看懂（用户 2026-11-23：不要把任务标题直接扔上去）：
 *  分类由客户端随 title 给（结案 / 释放 / 取消 / 删除各用各的），描述是任务名；
 *  这里只在描述后补动作结果后缀（中文由客户端按界面语言传，host 不产出）。
 *  失败后缀含「请稍后重试」这类指引：核心 toast 不显示 TaskRecord.reason，
 *  所以人类可读的原因必须写进后缀，不能干巴巴一个「失败」（CONCERN 5）。
 *  只配 toast 交核心弹卡（用户 2026-11-23：本业务用不到 notify 广播与 UI 自弹）。 */
function completionConfig(title, buttonText, completionTexts) {
    const button = buttonText === undefined ? {} : { button: toastButton(buttonText) };
    const success = completionTexts?.success ?? "已结案";
    const failure = completionTexts?.failure ?? "失败";
    return {
        toast: {
            success: { title: { ...title, description: `${title.description}（${success}）` }, ...button },
            failure: { title: { ...title, description: `${title.description}（${failure}）` }, ...button },
        },
    };
}
/**
 * 建一个进程内 store。不落盘是刻意的：宿主重启 ⇒ 会话必然已中断 ⇒ 记录随之消失才是真实状态。
 */
export function createSessionJobStore(archive) {
    const records = new Map();
    const outbox = [];
    const stateListeners = new Set();
    const noticeListeners = new Set();
    let noticeSeq = 0;
    // 宿主实例熵：进程每次启动都不同，通知 id 才不会在重启后复用（核心按 id 永久去重）。
    const instanceId = randomUUID();
    /** 同一业务键的运行实例身份：startedAt 必须严格递增，不能只靠 Date.now()。 */
    const lastStartedAt = new Map();
    const nextStartedAt = (key) => {
        const now = Math.max(Date.now(), (lastStartedAt.get(key) ?? 0) + 1);
        lastStartedAt.set(key, now);
        return now;
    };
    /** 同一业务键的披露时间严格递增：核心按 updatedAt 做 LWW，回退时间戳会被当旧帧丢弃。 */
    const lastProgressAt = new Map();
    const nextProgressAt = (key) => {
        const now = Math.max(Date.now(), (lastProgressAt.get(key) ?? 0) + 1);
        lastProgressAt.set(key, now);
        return now;
    };
    const progressOf = (key, message) => ({
        message,
        updatedAt: nextProgressAt(key),
    });
    const deadlineByKey = new Map();
    let reaper = null;
    const emitState = (record) => {
        for (const listener of [...stateListeners]) {
            try {
                listener(record);
            }
            catch {
                /* 订阅方自己炸了不该连累记录写入 */
            }
        }
    };
    const emitNotice = (notice) => {
        for (const listener of [...noticeListeners]) {
            try {
                listener(notice);
            }
            catch {
                /* 同上 */
            }
        }
    };
    const purgeExpired = (now) => {
        for (const [id, record] of records) {
            if (record.state === "running")
                continue;
            if (record.settledAt !== undefined && now - record.settledAt > TERMINAL_TTL_MS) {
                records.delete(id);
                deadlineByKey.delete(record.key ?? "");
            }
        }
        for (let i = outbox.length - 1; i >= 0; i--) {
            const task = outbox[i].task;
            if (task.settledAt !== undefined && now - task.settledAt > TERMINAL_TTL_MS)
                outbox.splice(i, 1);
        }
    };
    const ensureReaper = () => {
        if (reaper !== null)
            return;
        reaper = setInterval(() => {
            const now = Date.now();
            for (const [key, deadline] of [...deadlineByKey]) {
                if (deadline === 0 || now <= deadline)
                    continue;
                settle(key, "failed", { reason: "timeout" });
            }
            purgeExpired(now);
        }, REAP_INTERVAL_MS);
        reaper.unref?.();
    };
    function settle(key, state, input = {}) {
        const id = keyOf(PROJECT, key);
        const current = records.get(id);
        if (current === undefined)
            return undefined;
        if (current.state !== "running")
            return current;
        const now = Date.now();
        // 失败 toast 补短原因：核心只弹记录上的 toast 文案、不显示 reason，
        // 所以改写 toast.failure.title；完整 reason 仍留在 reason 字段供排查。
        const failureToast = state === "failed"
            ? { toast: withFailureReason(current.toast, input.reason ?? "超时") }
            : {};
        const next = {
            ...current,
            state,
            settledAt: now,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            ...failureToast,
            ...(input.result === undefined ? {} : { detail: withResult(current.detail, input.result) }),
            ...(input.progressMessage === undefined
                ? {}
                : { progress: progressOf(key, input.progressMessage) }),
        };
        records.set(id, next);
        deadlineByKey.delete(key);
        const notice = {
            id: `${PROJECT}:${instanceId}:${key}:${String(++noticeSeq)}`,
            task: next,
        };
        outbox.push(notice);
        emitState(next);
        emitNotice(notice);
        // 结案归档只认终态漏斗：done / failed / reaper 超时都走这里，release 无 sessionId 自然跳过。
        // 不 await、不改作业结论；归档失败只留 warn，会话仍在侧栏供排查。
        if (archive !== undefined) {
            const sessionId = sessionIdOf(next.detail);
            if (sessionId !== null)
                void archive(sessionId).catch((error) => {
                    console.warn(`[task-ledger] archive session ${sessionId} failed`, error);
                });
        }
        return next;
    }
    function claim(key, title, kind, buttonText, completionTexts) {
        const id = keyOf(PROJECT, key);
        const existing = records.get(id);
        if (existing !== undefined && existing.state === "running")
            return false;
        const now = nextStartedAt(key);
        const record = {
            id: `${PROJECT}:${key}:${String(now)}`,
            key,
            project: PROJECT,
            group: GROUP,
            title,
            state: "running",
            startedAt: now,
            kind,
            rowButtons: rowButtons(kind),
            ...completionConfig(title, buttonText, completionTexts),
        };
        // 占位只在服务端内存里占 key，**不推 SSE**：createSession 期间会话还没建起来，
        // 推一条无 sessionId 的 running 行会给所有标签页画出点了没反应的「查看会话」死按钮；
        // createSession 失败时也没有删除帧可发，会留幽灵锁行。等 register 成功才对外可见。
        records.set(id, record);
        return true;
    }
    function release(key) {
        const id = keyOf(PROJECT, key);
        const current = records.get(id);
        if (current === undefined || current.state !== "running")
            return;
        if (current.detail !== undefined)
            return; // 已填详情 = 真在跑，不能误删
        // 用终态帧收口，不静默删除：并发提交者的本地乐观行靠这条 failed 帧按 (project,key)
        // 归一解锁；核心没有「删除帧」，静默删会让别的标签页的乐观行永久卡在 running。
        settle(key, "failed", { reason: "session-start-failed" });
    }
    function register(input) {
        const id = keyOf(PROJECT, input.key);
        const prior = records.get(id);
        // 有占位就沿用它的 startedAt（同一运行实例）；没有才新造一个严格递增的身份。
        const now = prior?.startedAt ?? nextStartedAt(input.key);
        const maxDurationMs = input.maxDurationMs ?? 0;
        const record = {
            ...(prior ?? {
                id: `${PROJECT}:${input.key}:${String(now)}`,
                key: input.key,
                project: PROJECT,
                group: GROUP,
                title: input.title,
                state: "running",
                startedAt: now,
            }),
            // 服务端回显核心随提交体发来的归属字段：scope:'origin' 弹卡与「查看会话」跳回发起面板都靠它。
            ...(input.origin === undefined ? {} : { origin: input.origin }),
            ...(input.panelId === undefined ? {} : { panelId: input.panelId }),
            title: input.title,
            state: "running",
            detail: {
                ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
                taskId: input.taskId,
                workspace: input.workspace,
            },
            kind: input.kind,
            rowButtons: rowButtons(input.kind),
            ...completionConfig(input.title, input.buttonText, input.completionTexts),
            ...(input.progressMessage === undefined
                ? {}
                : { progress: progressOf(input.key, input.progressMessage) }),
        };
        records.set(id, record);
        deadlineByKey.set(input.key, maxDurationMs > 0 ? now + maxDurationMs : 0);
        emitState(record);
        ensureReaper();
        return record;
    }
    function reportProgress(key, message) {
        const id = keyOf(PROJECT, key);
        const current = records.get(id);
        if (current === undefined || current.state !== "running")
            return undefined;
        if (message.trim() === "")
            return undefined;
        const next = { ...current, progress: progressOf(key, message) };
        records.set(id, next);
        emitState(next);
        return next;
    }
    return {
        claim,
        release,
        register,
        settle,
        reportProgress,
        find(key) {
            return records.get(keyOf(PROJECT, key));
        },
        dispose() {
            if (reaper !== null)
                clearInterval(reaper);
            reaper = null;
            stateListeners.clear();
            noticeListeners.clear();
        },
        async snapshot(_viewer) {
            return [...records.values()].sort((a, b) => b.startedAt - a.startedAt);
        },
        subscribe(listener, _viewer) {
            stateListeners.add(listener);
            return () => {
                stateListeners.delete(listener);
            };
        },
        subscribeNotices(listener, _viewer) {
            // 回放 outbox：断线 / 刷新期间结算的终态也能补投；客户端按 notice.id 永久去重。
            for (const notice of [...outbox]) {
                try {
                    listener(notice);
                }
                catch {
                    /* 订阅方异常不影响回放其余通知 */
                }
            }
            noticeListeners.add(listener);
            return () => {
                noticeListeners.delete(listener);
            };
        },
    };
}
/** 业务键：同一条任务同一时刻只允许一个结案作业（跨刷新、跨标签页成立）。 */
export function closeJobKey(taskId) {
    return `close:${taskId}`;
}
/** 各写动作独立业务键，动作不同可并行、同动作同任务互斥。 */
export function claimJobKey(taskId) {
    return `claim:${taskId}`;
}
