// 合成大库 fixture 生成器（冒烟 perf 用例的唯一来源）。
// 纪律：生成物只写 os.tmpdir()/dtl-fixtures/，**绝不出仓**（6MB+ 的造库文件进 dist 是事故）；
// 幂等：已存在且行数够就复用，不重复生成；确定性内容（无随机），跨机器可复现。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 合成 history 数据行数（冒烟 count-only 断言 count===10000/capped 依赖 ≥10000）。 */
export const PERF_ROWS = 50_000;

/** fixture 根目录（os.tmpdir 下，不入仓）。 */
export const PERF_ROOT = path.join(os.tmpdir(), "dtl-fixtures", "perf-50k");

const HISTORY_FILE = path.join(PERF_ROOT, "ledger", "history", "202610.md");

const HEADER = `# 进度历史（已结案）

| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |
|---|---|---|---|---|---|---|---|---|
`;

function row(index) {
	const n = String(index + 1).padStart(6, "0");
	return `| 2026-10-16 1${index % 9}:${String(index % 60).padStart(2, "0")}:00 | 2026-10-16 08:00:00 | 任务包 ${n} | 建设 | 标签A、标签B | @GuoJia-Agent | @GuoJia-Agent | 完成了任务 ${n} 的摘要文本，模拟真实长度的过程记录内容。 | [过程文档](../worklog/202610/${n}.md) |`;
}

/** 确保 fixture 就绪并返回根目录（同步：冒烟启动时一次调用，<300ms 生成 5 万行）。
 *  只造 history（不写 progress.json）——它与旧 /tmp/perf2 口径一致：
 *  resolveWorkspaces 的「无台账被过滤」用例正需要一个「有 history 无 progress.json」的工作区。 */
export function ensurePerfFixture() {
	if (fs.existsSync(HISTORY_FILE)) {
		const lines = fs.readFileSync(HISTORY_FILE, "utf-8").split("\n").length;
		if (lines >= PERF_ROWS + 4) return PERF_ROOT;
	}
	fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
	let body = HEADER;
	for (let i = 0; i < PERF_ROWS; i += 1) body += `${row(i)}\n`;
	fs.writeFileSync(HISTORY_FILE, body);
	return PERF_ROOT;
}

if (process.argv[1]?.endsWith("generate-perf.mjs")) {
	const root = ensurePerfFixture();
	console.log(`fixture 就绪：${root}（${PERF_ROWS} 行合成 history）`);
}
