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
        const data = event.data;
        if (data === null || typeof data !== "object" || Array.isArray(data))
            return;
        const { turn, step } = data;
        if (typeof turn !== "number" || typeof step !== "number")
            return;
        binding.lastSeq = seq;
        const message = binding.texts.step
            .replaceAll("{turn}", String(turn))
            .replaceAll("{step}", String(step));
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
