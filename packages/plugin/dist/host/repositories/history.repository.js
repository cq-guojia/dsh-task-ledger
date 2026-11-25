import path from "node:path";
import { cached, cacheKey } from "./cache.js";
import { failureOf, runLedgerScript } from "./runner.js";
/** 脚本一行 → 带工作区身份的记录（缺字段一律空串，不编造）。 */
function toRecord(raw, workspace) {
    const src = typeof raw.src === "string" ? raw.src : "";
    const line = typeof raw.line === "number" ? raw.line : 0;
    // history --json 的 src 相对 repo 根（ledger/history/YYYYMM.md）；
    // 对外统一收成相对 ledger/ 的路径（history/YYYYMM.md），仅供列表 key / 选中态用。
    const deleteSrc = src.startsWith("ledger/") ? src.slice("ledger/".length) : src;
    const text = (value) => typeof value === "string" ? value : "";
    // 历史行没有独立的任务号列，但 worklog 链接（../worklog/YYYYMM/DD-HHMM-xxx.md）里带着：
    // 任务号 = 目录 YYYYMM + 文件名（去 .md）。删除一律传这个号，行号只留给列表 key。
    const worklog = text(raw.worklog);
    const monthAndName = /worklog\/(\d{6})\/([^/]+)\.md$/.exec(worklog.replaceAll("\\", "/"));
    const taskId = monthAndName === null ? "" : monthAndName[1] + monthAndName[2];
    return {
        // ⚠️ 必须带工作区：各仓的 src 都是 `ledger/history/YYYYMM.md`、line 各自编号，
        // 只用 src:line 会让不同工作区的记录撞成同一个 key，合并去重时被当成重复吞掉。
        key: `${workspace.id}:${src}:${String(line)}`,
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        title: text(raw.title),
        summary: text(raw.summary),
        category: text(raw.category),
        tags: Array.isArray(raw.tags)
            ? raw.tags.filter((tag) => typeof tag === "string")
            : [],
        result: text(raw.result),
        owner: text(raw.owner),
        ownerName: text(raw.owner_name),
        creator: text(raw.creator),
        creatorName: text(raw.creator_name),
        created: text(raw.created),
        finished: text(raw.finished),
        // worklog 是相对**历史文件所在目录**的串（`../worklog/202610/x.md`）⇒ 这一步算成绝对路径，
        // 前端拿去直接开预览（页面不许自己拼台账布局）。空 = 这行没有过程文档。
        filePath: worklog === ""
            ? ""
            : path.join(workspace.path, "ledger", "history", worklog),
        taskId,
        src: deleteSrc,
        line,
    };
}
export async function readHistory(workspace, options) {
    const args = [
        "--repo",
        workspace.path,
        "--json",
        "--since",
        options.since,
        "--until",
        options.until,
    ];
    if (options.limit !== undefined)
        args.push("--limit", String(options.limit));
    if (options.owner !== undefined)
        args.push("--owner", options.owner);
    return await cached(cacheKey(workspace.id, "history", args.slice(2).join("\u0001")), async () => {
        const result = await runLedgerScript("history", args);
        if (!result.ok)
            throw failureOf(result, `${workspace.title}: `, workspace.id);
        const rows = result.data.records;
        if (!Array.isArray(rows))
            throw new Error(`${workspace.title}: history 输出缺 records 数组`);
        return {
            records: rows
                .filter((row) => row !== null && typeof row === "object")
                .map((row) => toRecord(row, workspace)),
            capped: result.data.capped === true,
        };
    });
}
