const FIELDS = ["starting", "step", "checking", "done", "failed"];
/** 提交体边界校验：只认五个非空字符串，防止畸形文案进 store。 */
export function isCloseProgressTexts(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    return FIELDS.every((field) => typeof record[field] === "string" && record[field] !== "");
}
/** 安装会话事件订阅；返回的 tracker 随插件 dispose 释放。 */
export function installSessionProgress(ctx, jobs) {
    const bindings = new Map();
    const onEvent = ((session, event) => {
        const id = session?.id;
        if (typeof id !== "string")
            return;
        const binding = bindings.get(id);
        if (binding === undefined || event?.type !== "step/start")
            return;
        const seq = event.seq;
        if (typeof seq !== "number" || !Number.isFinite(seq) || seq <= binding.lastSeq)
            return;
        binding.lastSeq = seq;
        // 只用 step/start 当「Agent 正在处理」这一真实节点的触发点——文案由客户端拼好，
        // 不带 {turn}/{step}：模型第几轮第几步没有业务语义，披露给人看的是作业阶段。
        const message = binding.texts.step;
        // register 之前只暂存：claim 占位行虽在内存，但还没推给 UI，写了也会被 starting 覆盖。
        if (!binding.ready) {
            binding.pending = message;
            return;
        }
        jobs.reportProgress(binding.key, message);
    });
    const onDisposed = ((session) => {
        if (typeof session?.id === "string")
            bindings.delete(session.id);
    });
    const offEvent = ctx.on("session/event", onEvent);
    const offDisposed = ctx.on("session/disposed", onDisposed);
    return {
        bind(sessionId, key, texts) {
            bindings.set(sessionId, { key, texts, lastSeq: -1, ready: false });
        },
        flush(sessionId) {
            const binding = bindings.get(sessionId);
            if (binding === undefined)
                return;
            binding.ready = true;
            if (binding.pending === undefined)
                return;
            const message = binding.pending;
            binding.pending = undefined;
            jobs.reportProgress(binding.key, message);
        },
        unbind(sessionId) {
            bindings.delete(sessionId);
        },
        dispose() {
            bindings.clear();
            offEvent?.();
            offDisposed?.();
        },
    };
}
