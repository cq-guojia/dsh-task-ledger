// 冒烟（任务 3「后端方法抽象」）：对真实 + 合成台账全链路验证 host 方法。
// 跑法：先 npm run build（tsc + copy-skill），再 node scripts/smoke.mjs——打的是 dist 产物。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const { resolveWorkspaces } = await import("../dist/host/workspace.js");
const { readTasks, getTask, readWorklog } = await import(
	"../dist/host/repositories/ledger.repository.js"
);
const { getHomeAggregate, getBoardSnapshot, queryClosed, getFilterOptions } =
	await import("../dist/host/board.js");
const { getCurrentIdentity } = await import(
	"../dist/host/repositories/identity.repository.js"
);
const { runLedgerScript } = await import("../dist/host/repositories/runner.js");
const { ensurePerfFixture } = await import("./fixtures/generate-perf.mjs");

let passed = 0;
function check(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(
			() => {
				passed += 1;
				console.log(`  ✓ ${name}`);
			},
			(error) => {
				console.error(`  ✗ ${name}\n    ${error.message}`);
				process.exitCode = 1;
			},
		);
}

// 合成大库 fixture（os.tmpdir()/dtl-fixtures/perf-50k，脚本现生成；不再硬编码某人 /tmp/perf2）
const PERF_PATH = ensurePerfFixture();
// 姊妹工作区（真机用例用）：缺它只降级真机断言，合成用例不受影响
const DISPATCH_PATH = path.resolve(repoRoot, "../dsh-task-dispatch-table");
const hasDispatch = fs.existsSync(
	path.join(DISPATCH_PATH, "ledger", "progress.json"),
);

const registry = [
	{ id: "ws-self", title: "dsh-task-ledger（本仓）", path: repoRoot },
	...(hasDispatch
		? [
				{
					id: "ws-dispatch",
					title: "dsh-task-dispatch-table",
					path: DISPATCH_PATH,
				},
			]
		: []),
	{ id: "ws-big", title: "perf-50k（合成）", path: PERF_PATH },
	{ id: "ws-none", title: "无台账（/tmp）", path: "/tmp" },
];

console.log("smoke: 后端方法抽象");

await check(
	"resolveWorkspaces：只返回有 progress.json 的（未初始化/无台账被过滤）",
	async () => {
		const found = resolveWorkspaces(registry);
		const ids = found.map((w) => w.id);
		assert.deepEqual(
			ids,
			hasDispatch ? ["ws-self", "ws-dispatch"] : ["ws-self"],
		);
	},
);

await check("readTasks：在办任务带 id 与 workspace", async () => {
	const tasks = await readTasks({
		id: "ws-self",
		title: "self",
		path: repoRoot,
	});
	// 只卡「有在办」，不写死条数：本仓台账会被日常结案改变，条数是数据不是契约
	// （结构断言才是这条冒烟要守的东西）。
	assert.ok(tasks.length >= 1, `本仓应有在办任务，实际 ${tasks.length}`);
	for (const task of tasks) {
		assert.ok(typeof task.id === "string" && task.id !== "");
		assert.equal(task.workspace.id, "ws-self");
	}
});

await check(
	"readTasks 错误路径：无 progress.json 的工作区抛人话错误",
	async () => {
		await assert.rejects(
			() => readTasks({ id: "x", title: "x", path: "/tmp" }),
			/progress\.json/,
		);
	},
);

await check(
	"getBoardSnapshot：统计与任务行（与历史量无关的热路径）",
	async () => {
		const started = Date.now();
		const board = await getBoardSnapshot([
			{ id: "ws-self", title: "self", path: repoRoot },
			...(hasDispatch
				? [{ id: "ws-dispatch", title: "dispatch", path: DISPATCH_PATH }]
				: []),
		]);
		const elapsed = Date.now() - started;
		const snapshot = board.snapshot;
		console.log(
			`    （耗时 ${elapsed}ms；在办 ${snapshot.tasks.length} 条，我的 ${snapshot.stats.myActive}，待认领 ${snapshot.stats.open}）`,
		);
		// 合并口径只在姊妹工作区在位时卡（缺它退化为「本仓独跑」断言，条数是数据不是契约）
		if (hasDispatch) assert.ok(snapshot.tasks.length >= 6);
		else assert.ok(snapshot.tasks.length >= 1);
		assert.ok(
			Number.isInteger(snapshot.stats.myActive) && snapshot.stats.myActive >= 0,
		);
		if (hasDispatch) assert.ok(snapshot.stats.open >= 4);
		assert.equal(
			snapshot.stats.staleDays,
			3,
			"停滞阈值应随响应下发（3 天未更新）",
		);
		assert.equal(
			snapshot.stats.overdueDays,
			14,
			"逾期阈值应随响应下发（认领满 14 天）",
		);
		assert.equal(
			snapshot.stats.backlogDays,
			30,
			"积压阈值应随响应下发（待认领满 30 天）",
		);
		assert.equal(typeof snapshot.stats.backlog, "number", "积压条数应是数字");
		assert.equal(
			typeof snapshot.stats.oldestOpenDays,
			"number",
			"最老待认领天数应是数字",
		);
		assert.equal(
			typeof snapshot.stats.myStale,
			"number",
			"「我的停滞」条数应随响应下发（我的待办小字）",
		);
		for (const task of snapshot.tasks) {
			assert.equal(
				typeof task.stale,
				"boolean",
				"每行都应带 host 判好的 stale 标记",
			);
			assert.equal(
				typeof task.overdue,
				"boolean",
				"每行都应带 host 判好的 overdue 标记",
			);
			assert.equal(
				typeof task.backlog,
				"boolean",
				"每行都应带 host 判好的 backlog 标记",
			);
			if (task.status === "open")
				assert.equal(task.ageDays, null, "待认领不算「认领后未动」");
			// 悬停提示用的两个天数：进行中给 idleDays，待认领给 waitingDays，其余为 null
			if (task.status === "open")
				assert.ok(
					Number.isInteger(task.waitingDays),
					"待认领应带「已等待天数」",
				);
			else assert.equal(task.waitingDays, null, "非待认领不算「已等待」");
		}
		assert.ok(elapsed < 2000, `热路径应 <2s，实际 ${elapsed}ms`);
	},
);

await check(
	"getHomeAggregate：近 8 周分组桶（完成 / 新增 × 所有 / 我的）+ 四个自然周期",
	async () => {
		const home = await getHomeAggregate([
			{ id: "ws-self", title: "self", path: repoRoot },
		]);
		for (const scope of ["all", "mine"]) {
			const buckets = home.closed.weekly[scope];
			assert.equal(buckets.length, 8, `${scope} 应 8 桶`);
			assert.deepEqual(
				buckets.map((b) => b.week),
				[...buckets.map((b) => b.week)].sort(),
				"桶按周升序",
			);
			for (const bucket of buckets) {
				assert.ok(Number.isInteger(bucket.done) && bucket.done >= 0);
				assert.ok(Number.isInteger(bucket.created) && bucket.created >= 0);
				assert.ok(
					Number.isInteger(bucket.remaining) && bucket.remaining >= 0,
					`${scope} remaining 应是非负整数`,
				);
				// x 轴标注 = 周截止日：历史周 = 周一+6（周日）；当前周 = 今天。数据按截止日判，故标它。
				assert.ok(
					/^\d{4}-\d{2}-\d{2}$/.test(bucket.end),
					`${scope} end 应为 YYYY-MM-DD`,
				);
				assert.ok(bucket.end >= bucket.week, `${scope} end 应不早于周一`);
			}
			// 末桶（当前周）end = 今天；其余 end = 周一 + 6 天（host 用本地日期，测试同步本地，避免 toISOString 的 UTC 偏移）
			const ymdLocal = (d) =>
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			const addDays = (ymdStr, n) => {
				const d = new Date(`${ymdStr}T00:00:00`);
				d.setDate(d.getDate() + n);
				return ymdLocal(d);
			};
			const today = ymdLocal(new Date());
			buckets.forEach((bucket, i) => {
				if (i === buckets.length - 1)
					assert.equal(bucket.end, today, `${scope} 当前周 end 应为今天`);
				else
					assert.equal(
						bucket.end,
						addDays(bucket.week, 6),
						`${scope} 历史周 end 应为周一+6（周日）`,
					);
			});
			// remaining 自洽不变量（严谨版）：定义基线_i = remaining_i − Σcreated[0..i] + Σdone[0..i]
			// = 窗口前创建、且到周末 i 仍未结案的任务数。该集合只减不增 ⇒ 基线_i 单调不增且 ≥ 0。
			// （旧版断言「恒定」只在「无窗口前任务在窗口内结案」时巧合成立，并非一般正确。）
			// ⚠️ 仅对 all 口径校验：all 下 created/remaining/done 同口径（全工作区），基线有意义；
			// mine 下 created 是 creator 口径、remaining/done 是 owner 口径（不同集合），三者不可混算同一基线。
			if (scope === "all") {
				let prevBaseline = null;
				let cumCreated = 0;
				let cumDone = 0;
				buckets.forEach((bucket, i) => {
					cumCreated += bucket.created;
					cumDone += bucket.done;
					const baseline = bucket.remaining - cumCreated + cumDone;
					assert.ok(baseline >= 0, `${scope} remaining 自洽：基线 ≥ 0 @周${i}`);
					if (prevBaseline !== null)
						assert.ok(
							baseline <= prevBaseline,
							`${scope} remaining 自洽：基线单调不增 @周${i}`,
						);
					prevBaseline = baseline;
				});
			}
		}
		// 「我的」不可能超过「所有」
		for (let i = 0; i < 8; i += 1) {
			assert.ok(
				home.closed.weekly.mine[i].done <= home.closed.weekly.all[i].done,
				"mine 不应超过 all",
			);
			assert.ok(
				home.closed.weekly.mine[i].created <= home.closed.weekly.all[i].created,
				"mine 不应超过 all",
			);
			assert.ok(
				home.closed.weekly.mine[i].remaining <=
					home.closed.weekly.all[i].remaining,
				"mine 不应超过 all",
			);
		}
		// 口径分叉校验：新增(mine) 按 creator，完成/未结(mine) 按 owner
		await check(
			"口径分叉：新增(mine)=我创建的，完成/未结(mine)=我负责的",
			async () => {
				const dir = await fs.promises.mkdtemp(
					path.join(os.tmpdir(), "dtl-creator-"),
				);
				// identity 取合成台账目录的 git user.name（无本地 .git ⇒ 读 global，与聚合口径一致）
				const me = await getCurrentIdentity({
					id: "syn",
					title: "syn",
					path: dir,
				});
				assert.ok(me !== null, "需有 git user.name 才能判定 owner 口径");
				const other = `___not_${me}___`;
				await fs.promises.mkdir(path.join(dir, "ledger", "history"), {
					recursive: true,
				});
				// 在办：creator=me、owner=other、本周创建且未结
				await fs.promises.writeFile(
					path.join(dir, "ledger", "progress.json"),
					JSON.stringify({
						tasks: {
							x1: {
								title: "open",
								creator: me,
								owner: other,
								created: "2026-10-14 09:00:00",
								status: "doing",
							},
						},
					}),
				);
				// 已结：creator=me、owner=other、本周创建且本周结案（9 列历史，creator 列直接带）
				await fs.promises.writeFile(
					path.join(dir, "ledger", "history", "202610.md"),
					"| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |\n" +
						"|---|---|---|---|---|---|---|---|---|\n" +
						`| 2026-10-15 10:00:00 | 2026-10-12 09:00:00 | done |  |  | @${other} | @${me} | ok | [x](x) |\n`,
				);
				const agg = await getHomeAggregate([
					{ id: "syn", title: "syn", path: dir },
				]);
				const sum = (rows) => rows.reduce((s, w) => s + w, 0);
				const all = agg.closed.weekly.all;
				const mine = agg.closed.weekly.mine;
				assert.equal(
					sum(all.map((w) => w.created)),
					2,
					"all 新增应为 2（x1+x2 本周创建）",
				);
				assert.equal(
					sum(mine.map((w) => w.created)),
					2,
					"mine 新增应为 2（两者 creator=me）",
				);
				assert.equal(
					sum(mine.map((w) => w.done)),
					0,
					"mine 完成应为 0（x2 owner=other，非我完成）",
				);
				assert.equal(
					sum(mine.map((w) => w.remaining)),
					0,
					"mine 未结应为 0（x1 owner=other，非我负责）",
				);
			},
		);
		// 最后一桶 = 本周一（host 同口径）
		const now = new Date();
		const monday = new Date(now);
		monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
		const pad = (n) => String(n).padStart(2, "0");
		assert.equal(
			home.closed.weekly.all[7].week,
			`${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`,
		);
		// 四个自然周期：done / created / from / to 齐备，且区间合法
		const trend = home.trend;
		for (const [name, period] of Object.entries(trend)) {
			assert.ok(
				Number.isInteger(period.done) && period.done >= 0,
				`${name}.done 应是非负整数`,
			);
			assert.ok(
				Number.isInteger(period.created) && period.created >= 0,
				`${name}.created 应是非负整数`,
			);
			assert.ok(
				period.from <= period.to,
				`${name} 区间应 from <= to（${period.from} ~ ${period.to}）`,
			);
		}
		assert.equal(
			trend.thisWeek.to,
			trend.thisMonth.to,
			"本周 / 本月都截止到今天",
		);
		assert.ok(
			trend.lastWeek.to < trend.thisWeek.from,
			"上周应结束在本周开始之前",
		);
		assert.ok(
			trend.lastMonth.to < trend.thisMonth.from,
			"上月应结束在本月开始之前",
		);
		// 新增必须合并两个来源：本仓有在办（progress.json）+ 已结案（history），两者都该被数到
		assert.ok(
			trend.thisMonth.created >= trend.thisWeek.created,
			"本月新增 ≥ 本周新增",
		);
		console.log(
			`    （近 8 周完成 all=${home.closed.weekly.all.map((b) => b.done).join("/")}；本周/上周/本月/上月完成=${trend.thisWeek.done}/${trend.lastWeek.done}/${trend.thisMonth.done}/${trend.lastMonth.done}）`,
		);
	},
);

await check("queryClosed：近 13 个月窗口 + 创建时间倒序 + limit", async () => {
	// 条数基准吃合成 fixture（5 万行，内容固定）：断言的基准不能是本仓真实台账，
	// 那会随日常结案变化，且换个检出就可能只剩几条。
	const perfWs = { id: "ws-big", title: "perf-50k（合成）", path: PERF_PATH };
	const selfWs = { id: "ws-self", title: "self", path: repoRoot };
	const history = await queryClosed([perfWs, selfWs]);
	const records = history.records;
	assert.ok(records.length > 8, `历史应非空，实际 ${records.length}`);
	for (const record of records) assert.ok(record.workspace !== undefined);
	const keys = records.map((r) => String(r.created ?? r.time ?? ""));
	assert.deepEqual(keys, [...keys].sort().reverse(), "应按创建时间倒序");
	const limited = (await queryClosed([perfWs], { limit: 3 })).records;
	assert.equal(limited.length, 3);
});

await check("getFilterOptions：owner/category/tag 去重候选", async () => {
	// 自造一个小台账：不读本仓真实数据（会随日常结案变化），也不吃 perf fixture
	//（那个 fixture 故意只造 history、不写 progress.json，专门喂「无台账被过滤」用例）
	const board = fs.mkdtempSync(path.join(os.tmpdir(), "dtl-filter-"));
	try {
		fs.mkdirSync(path.join(board, "ledger", "history"), { recursive: true });
		fs.writeFileSync(
			path.join(board, "ledger", "progress.json"),
			JSON.stringify({
				tasks: {
					"20260101-0000-夹具任务-a1b2": {
						category: "夹具",
						created: "2026-01-01 00:00:00",
						creator: "fixture-owner",
						finished: null,
						owner: "fixture-owner",
						started: "2026-01-01 00:00:00",
						status: "doing",
						tags: ["看板", "查询"],
						title: "夹具任务",
						updated: "2026-01-01 00:00:00",
						worklog: null,
					},
				},
			}),
		);
		fs.writeFileSync(
			path.join(board, "ledger", "history", "202610.md"),
			"# 进度历史（已结案）\n\n| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |\n|---|---|---|---|---|---|---|---|---|\n" +
				"| 2026-10-01 10:00:00 | 2026-10-01 09:00:00 | 夹具结案 | 结案类 | 结案标签 | @fixture-owner | @fixture-owner | 夹具结案摘要 |  |\n",
		);
		const options = (
			await getFilterOptions([
				{ id: "ws-filter", title: "filter", path: board },
			])
		).options;
		const bare = (value) => String(value).replace(/^@/, "");
		assert.ok(
			options.owners.some((o) => bare(o) === "fixture-owner"),
			`owners 应含 fixture-owner，实际 ${options.owners.join(",")}`,
		);
		assert.ok(
			options.categories.includes("夹具"),
			`categories 应含在办的「夹具」，实际 ${options.categories.join(",")}`,
		);
		assert.ok(
			options.categories.includes("结案类"),
			"categories 应含已结案的分类",
		);
		assert.ok(options.tags.includes("查询"), "tags 应含在办标签");
		assert.ok(options.tags.includes("结案标签"), "tags 应含已结案标签");
		console.log(
			`    （owners=${options.owners.length} categories=${options.categories.length} tags=${options.tags.length}）`,
		);
	} finally {
		fs.rmSync(board, { recursive: true, force: true });
	}
});

await check("getTask + readWorklog：详情与过程正文", async () => {
	const workspace = { id: "ws-self", title: "self", path: repoRoot };
	const tasks = await readTasks(workspace);
	const withLog = tasks.find((task) => Boolean(task.worklog));
	assert.ok(withLog !== undefined, "应存在带 worklog 的在办任务");
	const task = await getTask(workspace, withLog.id);
	assert.ok(task?.id === withLog.id);
	const text = await readWorklog(workspace, task);
	assert.ok(text?.includes("## 背景") === true, "过程文档应含「## 背景」节");
	const missing = await readWorklog(workspace, {
		...task,
		worklog: "worklog/209901/01-0000-x-0000.md",
	});
	assert.equal(missing, null, "读不到的过程文档回 null 不炸");
});

await check("runLedgerScript：直调 count-only（合成 5 万行封顶）", async () => {
	const result = await runLedgerScript("history", [
		"--repo",
		PERF_PATH,
		"--json",
		"--count-only",
		"--months",
		"13",
	]);
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.data.count, 10000);
		assert.equal(result.data.capped, true);
	}
});

await check("runLedgerScript 错误路径：不存在的仓库 → 人话错误", async () => {
	const result = await runLedgerScript("list", [
		"--repo",
		"/tmp/definitely-not-here",
	]);
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.error, /repo|目录|不存在/);
});

await check(
	"空台账工作区不炸 /board（真机 500 回归：history 无文件时 --json 也必须出 JSON）",
	async () => {
		const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
			"node:fs"
		);
		const { tmpdir } = await import("node:os");
		const root = mkdtempSync(path.join(tmpdir(), "dsh-empty-ledger-"));
		try {
			mkdirSync(path.join(root, "ledger"), { recursive: true });
			writeFileSync(
				path.join(root, "ledger", "progress.json"),
				JSON.stringify({
					version: 6,
					tasks: {
						"20261017-1000-fresh-1": {
							title: "空台账工作区",
							status: "open",
							creator: "tester",
							created: "2026-10-17 10:00:00",
							worklog: "worklog/202610/17-1000-fresh-1.md",
						},
					},
				}),
			);
			const ws = [{ id: "ws-empty", title: "空台账", path: root }];
			// 关键路径：这正是 /board 路由的那一次聚合调用，抛就是整条 500
			const home = await getHomeAggregate(ws);
			assert.equal(
				home.snapshot.tasks.length,
				1,
				"有 progress.json 就应读到在办",
			);
			assert.equal(
				home.trend.thisWeek.done,
				0,
				"无历史 ⇒ 本周完成 0，不是抛错",
			);
			assert.equal(home.closed.weekly.all.length, 8);
			// 无历史 ⇒ 完成全 0；新增只有 synthetic 任务自己那一条（它的 created 可能不在本周）
			assert.ok(
				home.closed.weekly.all.every((bucket) => bucket.done === 0),
				"无历史 ⇒ 8 个桶完成全 0",
			);
			const createdTotal = home.closed.weekly.all.reduce(
				(sum, bucket) => sum + bucket.created,
				0,
			);
			assert.ok(
				createdTotal <= 1,
				`无历史 ⇒ 新增只该有 synthetic 那一条，实际 ${createdTotal}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);

await check(
	"getBoardSnapshot：identities 按工作区 id 给出当前 git 身份（前端「我的待办」判定源）",
	async () => {
		const snapshot = (
			await getBoardSnapshot([{ id: "ws-self", title: "self", path: repoRoot }])
		).snapshot;
		const ids = Object.keys(snapshot.identities);
		assert.deepEqual(
			ids,
			["ws-self"],
			`identities 应按工作区 id 建键，实际 ${JSON.stringify(ids)}`,
		);
		// 本仓有 git 身份 ⇒ 非 null；取不到（非 git 目录）时必须是 null，不许编造。
		assert.ok(
			snapshot.identities["ws-self"] === null ||
				typeof snapshot.identities["ws-self"] === "string",
		);
	},
);

// ── client 产物（浏览器半）：契约 + 文案两档对齐 ──
// 打 dist/client.js：它是 dsh 模块内核消费的 CJS 闭包工厂，形状错了插件根本加载不起来，
// 且这种错在类型检查里看不出来（tsc 只认源码）。
await check(
	"dist/client.js：模块加载器契约 + 只 require 平台模块",
	async () => {
		const { readFile } = await import("node:fs/promises");
		const text = await readFile(
			path.resolve(here, "../dist/client.js"),
			"utf-8",
		);
		assert.ok(
			text.includes("window.__ModuleLoader__.load("),
			"缺少模块加载器包裹",
		);
		assert.ok(text.includes('id: "dsh-task-ledger"'), "模块 id 应为包名");
		// 末尾还挂着 sourcemap 注释 ⇒ 先摘掉再看收尾。
		const code = text.replace(/\/\/# sourceMappingURL=.*$/m, "").trimEnd();
		assert.ok(code.includes("return module.exports;"), "缺少 factory 返回值");
		assert.ok(code.endsWith("});"), "缺少 factory 收尾");
		const PLATFORM = new Set([
			"react",
			"react/jsx-runtime",
			"react-dom",
			"react-dom/client",
			"@deepseek-ai/cordis",
			"@deepseek-ai/dsh-client-store",
			"@deepseek-ai/dsh-client-ui-slots",
			"@deepseek-ai/dsh-client-ui-primitives",
			"@deepseek-ai/dsh-client-ui-dockkit",
		]);
		const required = [...text.matchAll(/require\("([^"]+)"\)/g)].map(
			(m) => m[1],
		);
		const stray = required.filter((name) => !PLATFORM.has(name));
		assert.deepEqual(
			stray,
			[],
			`打进包外的 require 运行时必然抛：${stray.join(",")}`,
		);
		assert.ok(required.includes("react"), "react 应保留为平台 require");
	},
);

// 筛选是首页的核心逻辑，且**只在浏览器里跑** ⇒ 冒烟直测这两个纯函数（无 DOM 依赖；
// 剥类型直读源码，client 单文件产物不可 import）。
await check(
	"客户端两区视图：我的待办吃标题搜索 / 按工作区分组暂不过滤（用户 2026-10-17 二次定稿）",
	async () => {
		const { selectView } = await import(
			path.resolve(here, "../src/client/rows.ts")
		);
		const pad = (n) => String(n).padStart(2, "0");
		const ymd = (d) =>
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		const now = new Date();
		const wsA = { id: "w1", title: "A 项目", path: "/tmp/a" };
		const wsB = { id: "w2", title: "B 项目", path: "/tmp/b" };
		const today = `${ymd(now)} 10:00:00`;
		const tasks = [
			{
				id: "t1",
				workspace: wsA,
				title: "甲任务",
				status: "doing",
				owner: "me",
				creator: "me",
				created: today,
				tags: ["DSH"],
				ageDays: 0,
				stale: false,
				overdue: false,
				backlog: false,
			},
			{
				id: "t2",
				workspace: wsB,
				title: "乙任务",
				status: "open",
				owner: null,
				created: "2020-01-02 10:00:00",
				tags: [],
				ageDays: null,
				stale: false,
				overdue: false,
				backlog: true,
			},
			{
				id: "t3",
				workspace: wsB,
				title: "丙任务",
				status: "doing",
				owner: "other",
				created: today,
				tags: [],
				ageDays: 30,
				stale: true,
				overdue: true,
				backlog: false,
			},
		];
		const state = (query) => ({
			board: {
				identities: { w1: "me", w2: null },
				tasks,
				workspaces: [wsA, wsB],
				stats: {},
				closed: {},
			},
			query,
		});
		const base = {
			scope: "all",
			status: "all",
			workspace: "",
			keyword: "",
			othersKeyword: "",
		};
		const ids = (rows) => rows.map((r) => r.task.id);
		// 第一区 = 我的（跨工作区）；第二区 = 全部任务按工作区分组（含我的——会与第一区重叠，用户 2026-10-18）
		let view = selectView(state(base));
		assert.deepEqual(ids(view.mine), ["t1"], "第一区只有我名下的进行中");
		assert.deepEqual(
			view.groups.map((g) => g.workspaceId),
			["w1", "w2"],
			"第二区含全部工作区（我的 t1 也进来，不再被过滤掉）",
		);
		assert.deepEqual(
			ids(view.groups[0].rows),
			["t1"],
			"组内 w1：只有我的 doing",
		);
		assert.equal(view.total, 3, "total = 全部待办任务数");
		// 第二区含我的任务 ⇒ mine 必须说实话（不然按钮权限在第一区/第二区会判出两套）
		assert.equal(
			view.groups[0].rows[0].mine,
			true,
			"第二区里我的任务 mine=true",
		);
		assert.equal(
			view.groups[1].rows.every((r) => !r.mine),
			true,
			"第二区里别人的任务 mine=false",
		);
		// 搜索 / 工作区只归第一区；第二区吃状态档 + 自己的搜索（标题 / 执行人）
		view = selectView(state({ ...base, keyword: "甲" }));
		assert.deepEqual(ids(view.mine), ["t1"], "我的待办吃标题搜索");
		assert.deepEqual(ids(view.groups[0].rows), ["t1"], "我的搜索不影响第二区");
		view = selectView(state({ ...base, keyword: "不存在的词" }));
		assert.deepEqual(view.mine, [], "我的待办搜空即空");
		assert.deepEqual(ids(view.groups[0].rows), ["t1"], "搜空也不影响第二区");
		view = selectView(state({ ...base, workspace: "w2" }));
		assert.deepEqual(
			view.mine,
			[],
			"我的待办吃工作区过滤（w2 没有我的任务 ⇒ 空）",
		);
		assert.deepEqual(
			ids(view.groups[0].rows),
			["t1"],
			"工作区过滤只作用于第一区；第二区仍含全部工作区（含 w1 的 t1）",
		);
		// 第二区：状态档（积压 / 超期 / 停滞 / 待认领）+ othersKeyword（标题 / 执行人）
		assert.deepEqual(
			ids(selectView(state({ ...base, status: "open" })).groups[0].rows),
			["t2"],
		);
		assert.deepEqual(
			ids(selectView(state({ ...base, status: "backlog" })).groups[0].rows),
			["t2"],
			"积压 = 待认领超期",
		);
		assert.equal(
			selectView(state(base)).allCounts.backlog,
			1,
			"角标计数单列积压",
		);
		assert.deepEqual(
			ids(selectView(state({ ...base, status: "overdue" })).groups[0].rows),
			["t3"],
		);
		assert.deepEqual(
			ids(selectView(state({ ...base, status: "stale" })).groups[0].rows),
			["t3"],
		);
		assert.deepEqual(
			ids(selectView(state({ ...base, othersKeyword: "乙" })).groups[0].rows),
			["t2"],
			"第二区搜索吃标题",
		);
		assert.deepEqual(
			ids(
				selectView(state({ ...base, othersKeyword: "other" })).groups[0].rows,
			),
			["t3"],
			"第二区搜索吃执行人",
		);
		assert.deepEqual(
			selectView(state({ ...base, othersKeyword: "不存在的词" })).groups,
			[],
			"第二区搜空即无段",
		);
		// 范围 = 我的 ⇒ 不出第二区（query 保留字段，界面暂无控件）
		view = selectView(state({ ...base, scope: "mine" }));
		assert.deepEqual(ids(view.mine), ["t1"]);
		assert.deepEqual(view.groups, [], "「我的」不掺第二区");
	},
);

// 动作权限是两区**共用**的唯一判定（用户 2026-10-18：不许各判各的 ⇒ 第二区里我的任务也要有
// 继续 / 结束 / 释放）。纯函数、无 DOM ⇒ 直读源码测。
await check(
	"任务动作权限：统一方法 resolveActions（我的=继续/结束/释放，待认领=认领，别人的=只看）",
	async () => {
		const { resolveActions } = await import(
			path.resolve(here, "../src/client/rows.ts")
		);
		const board = {
			identities: { w1: "me" },
			tasks: [],
			workspaces: [],
			stats: {},
			closed: {},
		};
		const task = (over) => ({
			id: "x",
			workspace: { id: "w1", title: "A 项目", path: "/tmp/a" },
			title: "甲任务",
			status: "doing",
			owner: "me",
			creator: "me",
			tags: [],
			stale: false,
			overdue: false,
			...over,
		});
		const flat = (a) => ({
			view: a.view,
			claim: a.claim,
			resume: a.resume,
			finish: a.finish,
			release: a.release,
		});
		// 我的（doing / blocked）⇒ 继续 + 结束 + 释放 + 查看；不能认领（已经是我的了）
		assert.deepEqual(
			flat(resolveActions(task({}), board)),
			{ view: true, claim: false, resume: true, finish: true, release: true },
			"我的 doing：继续/结束/释放",
		);
		assert.deepEqual(
			flat(resolveActions(task({ overdue: true }), board)),
			{ view: true, claim: false, resume: true, finish: true, release: true },
			"我的阻塞（overdue）：同上",
		);
		// 别人在做 ⇒ 只有查看（不给人家的任务乱操作）
		assert.deepEqual(
			flat(resolveActions(task({ owner: "other" }), board)),
			{
				view: true,
				claim: false,
				resume: false,
				finish: false,
				release: false,
			},
			"别人的 doing：只有查看",
		);
		// 待认领 ⇒ 认领 + 查看
		assert.deepEqual(
			flat(resolveActions(task({ status: "open", owner: null }), board)),
			{ view: true, claim: true, resume: false, finish: false, release: false },
			"待认领：认领 + 查看",
		);
		// 快照没到 ⇒ 一律不当「我的」（绝不凭空给权限）
		assert.deepEqual(
			flat(resolveActions(task({}), null)),
			{
				view: true,
				claim: false,
				resume: false,
				finish: false,
				release: false,
			},
			"board=null：不装作是我的",
		);
	},
);

await check(
	"文案字典：zh / en 键完全对齐（漏一种语言界面就露键名）",
	async () => {
		// 纯数据模块、无副作用 ⇒ Node 24 原生剥类型直读源码（产物里键名已被打包压缩，读不出来）。
		const { zh, en } = await import(
			path.resolve(here, "../src/client/locales.ts")
		);
		const zk = Object.keys(zh).sort();
		const ek = Object.keys(en).sort();
		assert.deepEqual(
			ek,
			zk,
			`en 与 zh 键不一致：${JSON.stringify(zk.filter((k) => !ek.includes(k)).concat(ek.filter((k) => !zk.includes(k))))}`,
		);
		assert.ok(zk.length > 40, `键数应 >40，实际 ${zk.length}`);
		for (const [key, value] of Object.entries(zh)) {
			assert.ok(typeof value === "string" && value !== "", `zh.${key} 为空`);
		}
	},
);

await check(
	"buildSkillRegistration：name/description/正文 + 占位符替换为绝对路径",
	async () => {
		const { existsSync } = await import("node:fs");
		const { buildSkillRegistration } = await import(
			"../dist/host/skill/registration.js"
		);
		const registration = buildSkillRegistration();
		assert.equal(registration.name, "task-ledger");
		assert.ok(
			registration.description.length > 20,
			"description 应非空（取自 SKILL.md frontmatter）",
		);
		assert.ok(
			registration.content.includes("# task-ledger"),
			"正文应是完整 SKILL.md",
		);
		assert.ok(
			registration.content.includes("progress.py"),
			"正文应含脚本调用示例",
		);
		assert.ok(
			registration.content.includes("claim"),
			"正文应含子命令说明（claim 等）",
		);
		assert.ok(
			!registration.content.includes("<本 SKILL.md 所在目录>"),
			"占位符应全部替换",
		);
		const match = /python3 (\S*progress\.py)/.exec(registration.content);
		assert.ok(match !== null, "正文应含 python3 <路径>/progress.py 命令");
		assert.ok(existsSync(match[1]), `替换后的脚本路径应真实存在：${match[1]}`);
		console.log(
			`    （${registration.name}｜正文 ${registration.content.length} 字｜脚本 ${match[1]}）`,
		);
	},
);

await check(
	"records 入口校验：容器形状不对 ⇒ LedgerDataError（不静默返空/返空历史）",
	async () => {
		const { parseTaskList, parseHistoryRecords } = await import(
			"../dist/host/repositories/records.js"
		);
		const ws = { id: "x", title: "x", path: "/tmp" };
		assert.throws(() => parseTaskList([], ws), /list 输出不是/);
		assert.throws(() => parseTaskList({ a: "string" }, ws), /不是对象/);
		assert.throws(() => parseTaskList({ "": { title: "x" } }, ws), /空任务号/);
		assert.throws(() => parseHistoryRecords({ count: 1 }, ws), /缺 records/);
		// 元素级宽松：坏行跳过不炸；合法数据照常收（旧 8 列、缺可选字段不被误杀）
		assert.deepEqual(parseHistoryRecords({ count: 1, records: [] }, ws), []);
		assert.equal(
			parseHistoryRecords(
				{ count: 1, records: ["坏行", { time: "2026-10-01 00:00:00" }] },
				ws,
			).length,
			1,
		);
		assert.equal(parseTaskList({ t1: { title: "x" } }, ws).length, 1);
	},
);

await check(
	"降级：单工作区坏 ⇒ degraded + 其余照常；全坏 ⇒ 抛（500 路径，不许绿色空板）",
	async () => {
		const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
			"node:fs"
		);
		const { tmpdir } = await import("node:os");
		const root = mkdtempSync(path.join(tmpdir(), "dtl-degraded-"));
		try {
			const history =
				"| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |\n" +
				"|---|---|---|---|---|---|---|---|---|\n" +
				"| 2026-10-15 10:00:00 | 2026-10-12 09:00:00 | done |  |  | @me | @me | ok | [x](x) |\n";
			for (const name of ["good", "bad"]) {
				const dir = path.join(root, name);
				mkdirSync(path.join(dir, "ledger", "history"), { recursive: true });
				writeFileSync(
					path.join(dir, "ledger", "history", "202610.md"),
					history,
				);
			}
			writeFileSync(
				path.join(root, "good", "ledger", "progress.json"),
				JSON.stringify({
					tasks: {
						t1: {
							title: "好库任务",
							status: "open",
							creator: "me",
							created: "2026-10-14 09:00:00",
						},
					},
				}),
			);
			writeFileSync(
				path.join(root, "bad", "ledger", "progress.json"),
				"{ 这不是合法 JSON",
			);
			const ws = [
				{ id: "ws-good", title: "好库", path: path.join(root, "good") },
				{ id: "ws-bad", title: "坏库", path: path.join(root, "bad") },
			];
			const home = await getHomeAggregate(ws);
			assert.equal(home.snapshot.tasks.length, 1, "好库的在办应照常返回");
			assert.equal(home.degraded.length, 1, "应恰好一条降级");
			assert.equal(home.degraded[0].workspaceId, "ws-bad");
			assert.equal(home.degraded[0].op, "history");
			assert.ok(
				home.degraded[0].message.length > 0,
				"降级要带人话原因（可直接上界面）",
			);
			// 好库单独跑与混合跑一致（坏库没有污染好库的数值）
			const alone = await getBoardSnapshot([ws[0]]);
			assert.equal(
				alone.snapshot.tasks.length,
				1,
				"好库单独跑结果应与混合跑一致",
			);
			assert.equal(alone.degraded.length, 0, "好库单独跑不应有降级");
			// 全坏 ⇒ 抛（routes 转 500 + 人话）——防 python3 缺失被集体降级成绿色空板
			await assert.rejects(() => getHomeAggregate([ws[1]]), /JSON|progress/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);

// 读缓存（方案 B 三条口径）：时钟注入 ⇒ TTL 断言不靠 sleep；单飞用「慢 load + 并发三连」验。
await check(
	"读缓存：TTL 命中 + 单飞 + 按工作区 invalidate + 失败不缓存（方案 B）",
	async () => {
		const { cached, invalidate, cacheKey, CACHE_TTL_MS } = await import(
			"../dist/host/repositories/cache.js"
		);
		invalidate();
		const key = cacheKey("ws-smoke", "list", "no-filter");
		let loads = 0;
		const load = async () => {
			loads += 1;
			return { n: loads };
		};
		const t = Date.now();
		const first = await cached(key, load, t);
		assert.equal(loads, 1);
		const withinTtl = await cached(key, load, t + CACHE_TTL_MS - 1);
		assert.equal(loads, 1, "TTL 内命中：不该再起脚本进程");
		assert.equal(withinTtl, first, "命中返回同一引用（便宜，但调用方只许读）");
		const expired = await cached(key, load, t + CACHE_TTL_MS + 1);
		assert.equal(loads, 2, "TTL 过期应重读");
		assert.notEqual(expired, first);
		// key 三段都要：换工作区 / 换 op 都得各自一份，不许串味
		await cached(cacheKey("ws-other", "list", "no-filter"), load, t);
		await cached(cacheKey("ws-smoke", "history", "no-filter"), load, t);
		assert.equal(loads, 4, "工作区与 op 都在 key 里");
		// 按工作区失效：只清自己的，别的工作区还命中
		invalidate("ws-smoke");
		await cached(key, load, t);
		assert.equal(loads, 5, "invalidate(workspaceId) 后该工作区应重读");
		await cached(cacheKey("ws-other", "list", "no-filter"), load, t);
		assert.equal(loads, 5, "别的工作区不受影响");
		// 全清
		invalidate();
		await cached(key, load, t);
		assert.equal(loads, 6, "invalidate() 应全清");
		// 失败不入缓存：错就是错，重试必须真重跑
		const failKey = cacheKey("ws-smoke", "history", "fail");
		let attempts = 0;
		const flaky = async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("boom");
			return "ok";
		};
		await assert.rejects(() => cached(failKey, flaky, t), /boom/);
		assert.equal(await cached(failKey, flaky, t), "ok", "失败不该被缓存成结果");
		assert.equal(attempts, 2);
		// 单飞：同 key 三个并发只跑一次
		const single = cacheKey("ws-smoke", "list", "inflight");
		let runs = 0;
		const slow = () =>
			new Promise((resolve) => {
				setTimeout(() => {
					runs += 1;
					resolve(runs);
				}, 16);
			});
		const results = await Promise.all([
			cached(single, slow, t),
			cached(single, slow, t),
			cached(single, slow, t),
		]);
		assert.equal(runs, 1, "同 key 并发应单飞（只起一次脚本）");
		assert.deepEqual(results, [1, 1, 1], "三个调用方拿到同一份结果");
	},
);

await check(
	"路由层：/board/snapshot 瘦身 + /board/trend 独立 + 旧 /board 仍全量（兼容期不许砍）",
	async () => {
		const { registerRoutes } = await import("../dist/host/routes.js");
		const routes = new Map();
		const fakeServer = {
			register: (route) => {
				routes.set(route.path, route.handler);
			},
		};
		registerRoutes(fakeServer, {
			registry: {
				list: () => [{ id: "ws-self", title: "self", path: repoRoot }],
			},
		});
		const call = async (suffix, query = "") => {
			const handler = routes.get(`/api/task-ledger${suffix}`);
			assert.ok(handler !== undefined, `路由应存在：${suffix}`);
			const out = { status: 0, body: "" };
			await handler(
				{ url: `${suffix}${query}` },
				{
					writeHead: (status) => {
						out.status = status;
					},
					end: (text) => {
						out.body = text;
					},
				},
			);
			return { status: out.status, body: JSON.parse(out.body) };
		};
		// 端点白名单：新增/漏注册立刻红
		assert.deepEqual(
			[...routes.keys()].sort(),
			[
				"/api/task-ledger/board",
				"/api/task-ledger/board/snapshot",
				"/api/task-ledger/board/trend",
				"/api/task-ledger/filters",
				"/api/task-ledger/history",
				"/api/task-ledger/task",
				"/api/task-ledger/tasks",
				"/api/task-ledger/workspaces",
			].sort(),
		);
		const snapshot = await call("/board/snapshot");
		assert.equal(snapshot.status, 200);
		assert.ok(Array.isArray(snapshot.body.tasks), "快路径应带在办");
		assert.ok(
			snapshot.body.trend === undefined,
			"快路径**不得**带 trend（瘦身的可断言判据）",
		);
		assert.ok(Array.isArray(snapshot.body.degraded), "快路径恒带 degraded");
		const trend = await call("/board/trend");
		assert.equal(trend.status, 200);
		assert.equal(trend.body.closed.weekly.all.length, 8, "慢路径应带 8 桶");
		assert.ok(trend.body.tasks === undefined, "慢路径**不得**带在办明细");
		const board = await call("/board");
		assert.ok(
			board.body.trend !== undefined,
			"旧 /board（兼容期）仍须带 trend",
		);
		assert.ok(Array.isArray(board.body.degraded), "旧 /board 也恒带 degraded");
		// fresh=1：每个读端点都认（先清缓存再算），不能因为缓存层把手动刷新变成「看旧数」
		const fresh = await call("/board/snapshot", "?fresh=1");
		assert.equal(fresh.status, 200, "fresh=1 应正常返回");
		assert.ok(Array.isArray(fresh.body.tasks), "fresh=1 也要带在办");
	},
);

// 结束任务交接（2026-10-18 拍板 B 案：只有「结束」走会话，认领 / 释放由 host 直写）。
// fake agents / presets / defaultModel —— 不碰真模型，只钉「建会话的参数」与「首条消息长什么样」。
await check(
	"结束任务交接：提示词三段约束 + POST /close（建会话 / preset / 首条消息 / 守卫）",
	async () => {
		const { registerSessionRoutes } = await import("../dist/host/routes.js");
		const { buildClosePrompt } = await import(
			"../dist/host/services/session.service.js"
		);

		// ① 提示词：任务号 / 过程文档绝对路径 / 用户留言（放最末）/ 三条硬约束
		const prompt = buildClosePrompt({
			title: "示例任务",
			taskId: "20260101-0000-示例-abcd",
			workspacePath: "/tmp/ws",
			worklogPath: "worklog/202601/01-0000-示例-abcd.md",
			message: "先把 X 修完再关",
		});
		assert.ok(prompt.includes("20260101-0000-示例-abcd"), "提示词要带任务号");
		assert.ok(
			prompt.includes("/tmp/ws/ledger/worklog/202601/01-0000-示例-abcd.md"),
			"过程文档给绝对路径，模型不用猜",
		);
		assert.ok(
			prompt.trimEnd().endsWith("先把 X 修完再关"),
			"用户留言放最末（越靠后遵守率越高）",
		);
		assert.ok(
			prompt.includes("不要新建会话"),
			"必须有「不要新建会话」这条硬约束",
		);
		assert.ok(
			prompt.includes(
				"/skill/scripts/progress.py close --id 20260101-0000-示例-abcd --repo /tmp/ws",
			),
			"必须给出可直接执行的脚本命令（skill 脚本 + 任务号 + 工作区）",
		);
		assert.ok(
			prompt.includes("--summary"),
			"close 的必填参数 --summary 要点名",
		);
		assert.ok(prompt.includes("不要停下来反问"), "用户已留言 ⇒ 不许回头提问");
		assert.ok(
			buildClosePrompt({
				title: "t",
				taskId: "i",
				workspacePath: "/tmp",
				worklogPath: null,
				message: "",
			}).includes("（用户没有留具体内容）"),
			"空留言给大人话，不塞空段落",
		);

		// ② 路由：用自仓真任务跑一次，断言建会话的每个参数
		const workspaces = resolveWorkspaces([
			{ id: "ws-self", title: "self", path: repoRoot },
		]);
		assert.equal(workspaces.length, 1, "自仓应含台账");
		const rows = await readTasks(workspaces[0]);
		assert.ok(rows.length > 0, "自仓应有在办任务");
		const task = rows[0];

		let created = null;
		let sent = null;
		let mounted = null;
		let attached = null;
		const presets = {
			resolve: async () => ({ id: "preset-default" }),
			mount: async (_ctx, id) => {
				mounted = id;
			},
		};
		const defaultModel = {
			currentSelection: () => ({ provider: "provider-x", model: "model-y" }),
		};
		const routes = new Map();
		registerSessionRoutes(
			{
				register: (route) => {
					routes.set(route.path, route.handler);
				},
			},
			{
				registry: {
					list: () => [
						{
							id: "ws-self",
							title: "self",
							path: repoRoot,
							attachSession: async (id) => {
								attached = id;
							},
						},
					],
				},
				agents: {
					create: async (options) => {
						created = options;
						return {
							agent: {
								send: (message, target, wakeup) => {
									sent = { message, target, wakeup };
								},
							},
						};
					},
				},
				getService: (name) =>
					({ agentPresets: presets, agentDefaultModel: defaultModel })[name],
			},
		);

		const handler = routes.get("/api/task-ledger/close");
		assert.ok(handler !== undefined, "/close 应注册");
		const call = async (method, body, headers = {}) => {
			const out = { status: 0, body: "" };
			await handler(
				{
					method,
					url: "/close",
					headers,
					socket: { remoteAddress: "127.0.0.1" },
					async *[Symbol.asyncIterator]() {
						if (body !== undefined) yield Buffer.from(JSON.stringify(body));
					},
				},
				{
					writeHead: (status) => {
						out.status = status;
					},
					end: (text) => {
						out.body = text;
					},
				},
			);
			return {
				status: out.status,
				body: out.body === "" ? {} : JSON.parse(out.body),
			};
		};
		assert.equal((await call("GET")).status, 405, "只接 POST");
		assert.equal((await call("POST", {})).status, 400, "缺 ws / id 应 400");
		assert.equal(
			(
				await call("POST", {
					ws: "ws-self",
					id: task.id,
					provider: "only-provider",
				})
			).status,
			400,
			"provider 只给一半应 400",
		);
		assert.equal(
			(await call("POST", { ws: "ws-none", id: task.id })).status,
			404,
			"工作区不存在应 404",
		);
		assert.equal(
			(
				await call(
					"POST",
					{ ws: "ws-self", id: task.id },
					{ origin: "https://evil.example", host: "127.0.0.1:1" },
				)
			).status,
			403,
			"跨源应 403",
		);

		const ok = await call("POST", {
			ws: "ws-self",
			id: task.id,
			message: "就到这里吧",
		});
		assert.equal(
			ok.status,
			200,
			`正常结束应 200，实际 ${ok.status} ${JSON.stringify(ok.body)}`,
		);
		assert.match(ok.body.sessionId, /^[0-9a-f-]{36}$/, "sessionId 应是 uuid");
		assert.equal(created.meta.cwd, repoRoot, "会话 cwd 必须是该工作区真实路径");
		assert.equal(
			created.meta.agentPreset,
			"preset-default",
			"preset 要落进会话身份（否则模型没有工具）",
		);
		assert.deepEqual(
			created.agentOptions,
			{ provider: "provider-x", model: "model-y" },
			"没选模型 ⇒ 用宿主默认，且必须成对显式传",
		);
		// 真宿主由工厂调 setup；这里手动跑一次，验证它确实把 preset 挂上（不挂 = 会话没有 fs/bash 工具）
		await created.setup({});
		assert.equal(mounted, "preset-default", "setup 里要 mount preset");
		assert.equal(attached, ok.body.sessionId, "会话要挂进工作区列表");
		assert.equal(sent.target, "next-turn");
		assert.equal(sent.wakeup, true, "要唤醒 driver，否则没人跑");
		assert.equal(sent.message.role, "user");
		assert.equal(
			sent.message.source.kind,
			"task-ledger",
			"source.kind 用生产者自有 kind",
		);
		assert.ok(
			sent.message.content[0].text.includes(task.id),
			"首条消息要带任务号",
		);
		assert.ok(
			sent.message.content[0].text.includes("就到这里吧"),
			"首条消息要带用户留言",
		);

		// 宿主缺 agents ⇒ 503 人话，不半建会话
		routes.clear();
		registerSessionRoutes(
			{
				register: (route) => {
					routes.set(route.path, route.handler);
				},
			},
			{
				registry: {
					list: () => [{ id: "ws-self", title: "self", path: repoRoot }],
				},
				agents: undefined,
				getService: () => undefined,
			},
		);
		let missingStatus = 0;
		let missingBody = "";
		await routes.get("/api/task-ledger/close")(
			{
				method: "POST",
				url: "/close",
				headers: {},
				socket: { remoteAddress: "127.0.0.1" },
				async *[Symbol.asyncIterator]() {
					yield Buffer.from(JSON.stringify({ ws: "ws-self", id: task.id }));
				},
			},
			{
				writeHead: (status) => {
					missingStatus = status;
				},
				end: (text) => {
					missingBody = text;
				},
			},
		);
		assert.equal(missingStatus, 503, "没 agents 服务应 503（人话），不是 500");
		assert.ok(missingBody.includes("agents"), "503 要带人话原因");
	},
);

// 认领 / 释放（2026-10-18 B 混合制）：host 直跑脚本，不开会话；cwd 必须是工作区（owner 取 git 身份）。
await check(
	"认领 / 释放：host 直写（无会话 / cwd 取身份 / POST 守卫）",
	async () => {
		const { registerWriteRoutes } = await import("../dist/host/routes.js");
		const { claimTask, releaseTask } = await import(
			"../dist/host/services/ledger-write.service.js"
		);
		const { execFileSync } = await import("node:child_process");
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "dtl-write-"));
		try {
			// 真 git 仓：脚本的 owner 只认 cwd 的 git config user.name（--repo 只解决路径）
			execFileSync("git", ["init", "-q"], { cwd: root });
			execFileSync("git", ["config", "user.name", "smoke-user"], { cwd: root });
			execFileSync("git", ["config", "user.email", "smoke@example.com"], {
				cwd: root,
			});
			fs.mkdirSync(path.join(root, "ledger"), { recursive: true });
			const taskId = "20260101-0000-示例-abcd";
			const progressPath = path.join(root, "ledger", "progress.json");
			fs.writeFileSync(
				progressPath,
				JSON.stringify({
					tasks: {
						[taskId]: {
							title: "示例",
							status: "open",
							creator: "smoke-user",
							created: "2026-01-01 00:00:00",
							worklog: null,
						},
					},
				}),
			);
			const readTask = () =>
				JSON.parse(fs.readFileSync(progressPath, "utf-8")).tasks[taskId];
			const ws = { id: "ws-tmp", title: "tmp", path: root };

			await claimTask(ws, taskId);
			assert.equal(readTask().status, "doing", "认领后应为 doing");
			assert.equal(
				readTask().owner,
				"smoke-user",
				"owner 应取工作区 git 身份（不是宿主进程 cwd）",
			);
			await releaseTask(ws, taskId);
			assert.equal(readTask().status, "open", "释放后应回 open");
			assert.equal(readTask().owner, null, "释放后 owner 应清空");

			// 路由守卫：POST only / 缺参 / 未知工作区 / 跨源；正常认领要真落盘
			const routes = new Map();
			registerWriteRoutes(
				{
					register: (route) => {
						routes.set(route.path, route.handler);
					},
				},
				{
					registry: { list: () => [ws] },
				},
			);
			assert.ok(
				routes.get("/api/task-ledger/claim") !== undefined,
				"/claim 应注册",
			);
			assert.ok(
				routes.get("/api/task-ledger/release") !== undefined,
				"/release 应注册",
			);
			const call = async (routePath, method, body, headers = {}) => {
				const out = { status: 0, body: "" };
				await routes.get(`/api/task-ledger${routePath}`)(
					{
						method,
						url: routePath,
						headers,
						socket: { remoteAddress: "127.0.0.1" },
						async *[Symbol.asyncIterator]() {
							if (body !== undefined) yield Buffer.from(JSON.stringify(body));
						},
					},
					{
						writeHead: (status) => {
							out.status = status;
						},
						end: (text) => {
							out.body = text;
						},
					},
				);
				return {
					status: out.status,
					body: out.body === "" ? {} : JSON.parse(out.body),
				};
			};
			assert.equal((await call("/claim", "GET")).status, 405, "只接 POST");
			assert.equal(
				(await call("/claim", "POST", {})).status,
				400,
				"缺 ws / id 应 400",
			);
			assert.equal(
				(await call("/claim", "POST", { ws: "ws-none", id: taskId })).status,
				404,
				"未知工作区应 404",
			);
			assert.equal(
				(
					await call(
						"/claim",
						"POST",
						{ ws: "ws-tmp", id: taskId },
						{ origin: "https://evil.example", host: "127.0.0.1:1" },
					)
				).status,
				403,
				"跨源应 403",
			);
			const ok = await call("/claim", "POST", { ws: "ws-tmp", id: taskId });
			assert.equal(
				ok.status,
				200,
				`正常认领应 200，实际 ${ok.status} ${JSON.stringify(ok.body)}`,
			);
			assert.equal(ok.body.ok, true, "写端点应回 ok: true");
			// fixture 没有 upstream：脚本退出码 0 但同步不推送，这条提示必须一路带到响应里（不许当成功吞掉）
			assert.ok(
				typeof ok.body.notice === "string" &&
					ok.body.notice.includes("没有上游"),
				`退出码 0 的同步提示必须随响应带出：${JSON.stringify(ok.body)}`,
			);
			assert.equal(readTask().status, "doing", "路由层认领也要真落盘");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	},
);

// 写前同步（2026-10-21 修）：只定向取 progress.json 与 history/，worklog 正文一个字都不碰。
// 覆盖三类事故：正文被覆盖丢失、本地改动被静默回退、远端新任务 / worklog 取不下来。
await check(
	"写前同步：定向取最新 / 正文保留 / 脏与未推送中止 / --no-sync / 只读不触发 / 离线可写",
	async () => {
		const { execFileSync, spawnSync } = await import("node:child_process");
		const script = path.join(here, "../skill/scripts/progress.py");
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "dtl-presync-"));
		const remote = path.join(base, "remote.git");
		const a = path.join(base, "a"); // 被测仓：有 upstream
		const b = path.join(base, "b"); // 他人副本：用来造远端新提交
		const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
		const git = (cwd, args) =>
			execFileSync("git", args, { cwd, env, encoding: "utf-8" }).trim();
		const run = (cwd, args, extraEnv = {}) =>
			spawnSync("python3", [script, ...args, "--repo", cwd], {
				cwd,
				env: { ...env, ...extraEnv },
				encoding: "utf-8",
			});
		const ident = (dir, name) => {
			git(dir, ["config", "user.name", name]);
			git(dir, ["config", "user.email", "smoke@example.com"]);
		};
		try {
			execFileSync("git", ["init", "--bare", "-q", remote], {
				env,
				encoding: "utf-8",
			});
			fs.mkdirSync(a, { recursive: true });
			git(a, ["init", "-q"]);
			ident(a, "smoke-user");
			git(a, ["remote", "add", "origin", remote]);
			fs.writeFileSync(path.join(a, "README.md"), "# fixture\n");
			git(a, ["add", "README.md"]);
			git(a, ["commit", "-q", "-m", "init"]);
			git(a, ["push", "-q", "-u", "origin", "HEAD"]);

			assert.equal(run(a, ["init"]).status, 0, "init 应成功（含写后提交推送）");
			const newRun = run(a, ["new", "--title", "a 侧任务", "--self"]);
			assert.equal(newRun.status, 0, `new 应成功：${newRun.stderr}`);
			const progressPath = path.join(a, "ledger", "progress.json");
			const tasks = () =>
				JSON.parse(fs.readFileSync(progressPath, "utf-8")).tasks;
			const aTaskId = Object.keys(tasks())[0];
			const logPath = path.join(a, "ledger", tasks()[aTaskId].worklog);

			// 正文由人写：脚本不得覆盖（历史 bug：每次 log 正文都回到模板骨架）
			const MARKER = "MARKER-正文不能被覆盖";
			fs.appendFileSync(logPath, `\n${MARKER}\n`);
			assert.equal(
				run(a, ["log", "--id", aTaskId, "--note", "冒烟：正文写入后记一条"])
					.status,
				0,
				"写正文后 log 应成功",
			);
			assert.ok(
				fs.readFileSync(logPath, "utf-8").includes(MARKER),
				"log 不得覆盖 worklog 正文",
			);

			// 脏 progress.json：写前取最新会覆盖它 → 中止，且字节不变
			const dirtyBefore = fs.readFileSync(progressPath);
			const dirtyData = Buffer.concat([dirtyBefore, Buffer.from("\n")]);
			fs.writeFileSync(progressPath, dirtyData);
			const dirtyRun = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：脏时应中止",
			]);
			assert.equal(dirtyRun.status, 1, "脏 progress.json 应中止");
			assert.ok(
				dirtyRun.stderr.includes("还没签入 git"),
				`应提示未提交改动：${dirtyRun.stderr}`,
			);
			assert.deepEqual(
				fs.readFileSync(progressPath),
				dirtyData,
				"中止时不得改动文件",
			);
			fs.writeFileSync(progressPath, dirtyBefore);

			// 有未推送的台账提交：联网后第一笔写先把它们推上去再照常写（2026-10-21 改，不再中止等用户手动 push）
			// 用 new 而不是 log 造这次提交：new 必然改 progress.json（多一个任务键），
			// log 只刷 updated，同一秒内可能内容不变、提交里就没有 progress.json。
			assert.equal(
				run(a, ["new", "--title", "本地未推送的任务", "--self"], {
					TASK_LEDGER_NO_SYNC: "1",
				}).status,
				0,
				"本地 new 应成功",
			);
			git(a, ["add", "ledger"]);
			git(a, ["commit", "-q", "-m", "chore(ledger): 故意不推的台账提交"]);
			const unpushed = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：未推送先补推",
			]);
			assert.equal(
				unpushed.status,
				0,
				`有未推送台账提交时应先补推再写：${unpushed.stderr}`,
			);
			assert.ok(
				unpushed.stderr.includes("推上去了"),
				`应先补推积压提交：${unpushed.stderr}`,
			);
			const unpushedBranch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			assert.equal(
				git(a, ["rev-parse", `origin/${unpushedBranch}`]),
				git(a, ["rev-parse", "HEAD"]),
				"补推后远端应与本地一致",
			);

			// 他人新建任务 → 本地写命令前取到最新；worklog 新文件被补下来，已有正文不动
			execFileSync("git", ["clone", "-q", remote, b], {
				env,
				encoding: "utf-8",
			});
			ident(b, "smoke-other");
			assert.equal(
				run(b, ["new", "--title", "b 侧任务", "--self"]).status,
				0,
				"他人 new 应成功",
			);
			const bTaskId = Object.keys(
				JSON.parse(
					fs.readFileSync(path.join(b, "ledger", "progress.json"), "utf-8"),
				).tasks,
			).find((id) => id !== aTaskId);
			const fetched = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：写前取最新",
			]);
			assert.equal(
				fetched.status,
				0,
				`取最新后写命令应成功：${fetched.stderr}`,
			);
			assert.ok(
				fetched.stderr.includes("快进"),
				`本地无未推送提交时应快进（只覆盖工作树会让远端内容被重放，rebase 必冲突）：${fetched.stderr}`,
			);
			assert.ok(tasks()[bTaskId], "应取到远端新建的任务");
			assert.ok(
				fs.existsSync(path.join(a, "ledger", tasks()[bTaskId].worklog)),
				"远端新增的 worklog 应被补下来",
			);
			assert.ok(
				fs.readFileSync(logPath, "utf-8").includes(MARKER),
				"补下的文件不得动已有正文",
			);

			// 先让 b 快进到远端最新：这条用例验的是「历史层只刷目标月」，
			// 不该被「两边同时改 progress.json 导致的 rebase 冲突」（B 类待定项）拖累。
			const bBranch = git(b, ["rev-parse", "--abbrev-ref", "HEAD"]);
			git(b, ["pull", "-q", "--ff-only", "origin", bBranch]);

			// 历史层只刷 close 真要写的那一个月：别人结案到 2020-01，非 close 命令不该把 202001.md 拉下来
			const closed = run(b, [
				"close",
				"--id",
				bTaskId,
				"--summary",
				"夹具：结案到旧月份",
				"--finished",
				"2020-01-15 10:00",
			]);
			assert.equal(
				closed.status,
				0,
				`他人结案到旧月份应成功：${closed.stderr}`,
			);
			assert.ok(
				!closed.stderr.includes("推送被拒"),
				`他人结案的推送应成功（否则下一步会被「有未推送提交」拦住）：${closed.stderr}`,
			);
			assert.ok(
				fs.existsSync(path.join(b, "ledger", "history", "202001.md")),
				"他人侧应生成 202001.md",
			);
			// 分支名不能写死 master：fixture 是 `git init`，分支名随 init.defaultBranch 变
			const aBranch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			const aheadBefore = git(a, [
				"log",
				"--oneline",
				`origin/${aBranch}..HEAD`,
			]);
			assert.equal(
				aheadBefore,
				"",
				`refetch 前本地应与远端同步：${aheadBefore}`,
			);
			// 不在这里断言「a 没有 202001.md」：b 的提交会让 a 落后，push 被拒后会自动 rebase，
			// 而 rebase 是整仓操作，会把远端那次提交（含历史文件）一并合进工作树。
			// 「只刷目标月」约束的是写前同步的主动写入，用下面的结构断言守。
			const refetch = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：不该拉别的月历史",
			]);
			assert.equal(refetch.status, 0, `log 应成功：${refetch.stderr}`);

			// 只读命令完全不碰 git
			assert.equal(
				run(b, ["new", "--title", "b 侧第二个任务", "--self"]).status,
				0,
				"他人再建一个",
			);
			const branch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			const originBefore = git(a, ["rev-parse", `origin/${branch}`]);
			assert.equal(run(a, ["list"]).status, 0, "list 应成功");
			assert.equal(
				git(a, ["rev-parse", `origin/${branch}`]),
				originBefore,
				"只读命令不该 fetch",
			);

			// 同一 worklog 被别处（另一台机器 / 同事）改过：写前必须刷成远端最新再追加。
			// 不刷就是「读旧版→追加→写回」，远端那次改动整段被写没（2026-10-21 修）。
			const remoteMark = "REMOTE-别处写进同一 worklog 的内容";
			fs.appendFileSync(
				path.join(b, "ledger", tasks()[aTaskId].worklog),
				`\n${remoteMark}\n`,
			);
			git(b, ["add", "ledger"]);
			git(b, ["commit", "-q", "-m", "chore(ledger): 别处改同一 worklog"]);
			git(b, ["push", "-q"]);
			const wlSync = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：写前刷 worklog",
			]);
			assert.equal(
				wlSync.status,
				0,
				`写前刷 worklog 后应成功：${wlSync.stderr}`,
			);
			const wlAfter = fs.readFileSync(logPath, "utf-8");
			assert.ok(
				wlAfter.includes(remoteMark),
				"写前必须取最新 worklog：远端内容被打头说明刷新没生效",
			);
			assert.ok(
				wlAfter.includes("冒烟：写前刷 worklog"),
				"取最新后仍要追加本次执行记录",
			);

			// --no-sync：写前不取、写后不推
			const aKnown = new Set(Object.keys(tasks()));
			assert.equal(
				run(b, ["new", "--title", "b 侧第三个任务", "--self"]).status,
				0,
				"他人再建一个",
			);
			const bNew = Object.keys(
				JSON.parse(
					fs.readFileSync(path.join(b, "ledger", "progress.json"), "utf-8"),
				).tasks,
			).filter((id) => !aKnown.has(id));
			assert.ok(bNew.length >= 1, "他人侧应有一个 a 没见过的任务");
			const off = run(
				a,
				["log", "--id", aTaskId, "--note", "冒烟：--no-sync"],
				{ TASK_LEDGER_NO_SYNC: "1" },
			);
			assert.equal(off.status, 0, `--no-sync 下应能写：${off.stderr}`);
			assert.ok(!bNew.some((id) => tasks()[id]), "--no-sync 不该取远端最新");
			// 以前这条路径一个字都不打，「已写未提交」就此静默腐烂
			assert.ok(
				off.stderr.includes("未签入 git"),
				`--no-sync 必须留痕：${off.stderr}`,
			);

			// 清掉 --no-sync 留下的未提交改动（该测的已测完），并把本地快进到远端，作为离线测试的干净起点
			git(a, ["reset", "-q", "--hard", "HEAD"]);
			const alignBranch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			git(a, ["pull", "-q", "--ff-only", "origin", alignBranch]);

			// 离线（remote 指向不存在的路径）：取最新失败只提示，写照常成功、只是推不上去
			git(a, [
				"remote",
				"set-url",
				"origin",
				path.join(base, "no-such-remote"),
			]);
			const offline = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：离线仍可写",
			]);
			assert.equal(offline.status, 0, `离线时应仍能写：${offline.stderr}`);
			assert.ok(offline.stderr.includes("写前拉取失败"), "离线应给明确提示");
			assert.ok(
				fs.readFileSync(logPath, "utf-8").includes("冒烟：离线仍可写"),
				"离线也要把记录写进正文",
			);

			// 联网恢复：写前先把离线攒下的台账提交推上去，不再拿「有 N 个没推」挡住写入
			git(a, ["remote", "set-url", "origin", remote]);
			const online = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：联网后自动补推",
			]);
			assert.equal(
				online.status,
				0,
				`联网后应能直接写（不该被「没推」挡住）：${online.stderr}`,
			);
			assert.ok(
				online.stderr.includes("推上去了"),
				`应先自动补推积压提交：${online.stderr}`,
			);
			const onlineBranch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			assert.equal(
				git(a, ["rev-parse", `origin/${onlineBranch}`]),
				git(a, ["rev-parse", "HEAD"]),
				"补推后远端应与本地一致",
			);

			// 推送被拒（放最后：换到只读远端，不再恢复）：退出码仍是 0（台账已写成功），
			// 但必须带出 git 原话，不能只给一句「认证 / 超时」的猜测
			const rejecting = path.join(base, "rejecting.git");
			execFileSync("git", ["init", "--bare", "-q", rejecting], {
				env,
				encoding: "utf-8",
			});
			git(a, ["remote", "set-url", "origin", rejecting]);
			git(a, ["push", "-q", "-u", "origin", "HEAD"]); // 先建好 upstream，模拟「正常远端突然拒绝推送」
			const hook = path.join(rejecting, "hooks", "pre-receive");
			fs.writeFileSync(
				hook,
				'#!/bin/sh\necho "denied by smoke hook" >&2\nexit 1\n',
			);
			fs.chmodSync(hook, 0o755);
			const rejected = run(a, [
				"log",
				"--id",
				aTaskId,
				"--note",
				"冒烟：推送被拒",
			]);
			assert.equal(
				rejected.status,
				0,
				`推送被拒时台账已写成功，退出码应仍为 0：${rejected.stderr}`,
			);
			assert.ok(
				rejected.stderr.includes("推送被拒"),
				`应提示推送被拒：${rejected.stderr}`,
			);
			assert.ok(
				rejected.stderr.includes("pre-receive hook declined"),
				`应带出 git 的 rejected 原话：${rejected.stderr}`,
			);
		} finally {
			fs.rmSync(base, { recursive: true, force: true });
		}
	},
);

// 手写 worklog 没提交时又赶上远端改了同一文件：收起来 → 快进 → 叠回去，
// 两边内容都得在；合不了就让 git 标冲突，不许拿旧版覆盖（2026-10-21 修）。
await check("写前同步：手写 worklog 撞远端同改，两边内容都保住", async () => {
	const { execFileSync, spawnSync } = await import("node:child_process");
	const script = path.join(here, "../skill/scripts/progress.py");
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "dtl-wlstash-"));
	const remote = path.join(base, "remote.git");
	const a = path.join(base, "a");
	const b = path.join(base, "b");
	const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
	const git = (cwd, args) =>
		execFileSync("git", args, { cwd, env, encoding: "utf-8" }).trim();
	const run = (cwd, args) =>
		spawnSync("python3", [script, ...args, "--repo", cwd], {
			cwd,
			env,
			encoding: "utf-8",
		});
	const ident = (dir, name) => {
		git(dir, ["config", "user.name", name]);
		git(dir, ["config", "user.email", "smoke@example.com"]);
	};
	try {
		execFileSync("git", ["init", "--bare", "-q", remote], {
			env,
			encoding: "utf-8",
		});
		fs.mkdirSync(a, { recursive: true });
		git(a, ["init", "-q"]);
		ident(a, "smoke-user");
		git(a, ["remote", "add", "origin", remote]);
		fs.writeFileSync(path.join(a, "README.md"), "# fixture\n");
		git(a, ["add", "README.md"]);
		git(a, ["commit", "-q", "-m", "init"]);
		git(a, ["push", "-q", "-u", "origin", "HEAD"]);
		assert.equal(run(a, ["init"]).status, 0, "init 应成功");
		assert.equal(
			run(a, ["new", "--title", "共享任务", "--self"]).status,
			0,
			"new 应成功",
		);
		const tasks = JSON.parse(
			fs.readFileSync(path.join(a, "ledger", "progress.json"), "utf-8"),
		).tasks;
		const tid = Object.keys(tasks)[0];
		const rel = tasks[tid].worklog;
		const logPath = path.join(a, "ledger", rel);

		execFileSync("git", ["clone", "-q", remote, b], { env, encoding: "utf-8" });
		ident(b, "smoke-other");
		fs.appendFileSync(path.join(b, "ledger", rel), "\nREMOTE-SIDE\n");
		git(b, ["add", "ledger"]);
		git(b, ["commit", "-q", "-m", "chore(ledger): 远端手写"]);
		git(b, ["push", "-q"]);

		fs.appendFileSync(logPath, "\nLOCAL-HANDWRITE\n");
		const res = run(a, ["log", "--id", tid, "--note", "本地一条记录"]);
		const text = fs.readFileSync(logPath, "utf-8");
		assert.ok(text.includes("REMOTE-SIDE"), "远端那次改动不得被旧版覆盖写没");
		assert.ok(text.includes("LOCAL-HANDWRITE"), "手写内容不得被覆盖吞掉");
		assert.equal(res.status, 1, `两边同改应中止并要求人工合并：${res.stderr}`);
		assert.ok(
			res.stderr.includes("冲突"),
			`应说清冲突与处理步骤：${res.stderr}`,
		);
		assert.notEqual(
			git(a, ["stash", "list"]),
			"",
			"手写内容要留在 stash 里，别丢",
		);
	} finally {
		fs.rmSync(base, { recursive: true, force: true });
	}
});

// 合并按「任务」对账，不是按文本行：行级合并只认相邻上下文，删一行 + 末尾加一行就撞；
// 按任务号对账后，不同任务各自改动自动合上，只有同一任务被两边改才报冲突（不静默选）。
await check("合并：不同任务自动合上 / 同一任务报冲突", async () => {
	const { execFileSync, spawnSync } = await import("node:child_process");
	const script = path.join(here, "../skill/scripts/progress.py");
	const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
	const git = (cwd, args) =>
		execFileSync("git", args, { cwd, env, encoding: "utf-8" }).trim();
	const run = (cwd, args, extraEnv = {}) =>
		spawnSync("python3", [script, ...args, "--repo", cwd], {
			cwd,
			env: { ...env, ...extraEnv },
			encoding: "utf-8",
		});
	const ident = (dir, name) => {
		git(dir, ["config", "user.name", name]);
		git(dir, ["config", "user.email", "smoke@example.com"]);
	};
	const bases = [];
	const setup = (tag, wanted) => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), `dtl-merge-${tag}-`));
		bases.push(base);
		const remote = path.join(base, "remote.git");
		const a = path.join(base, "a");
		const b = path.join(base, "b");
		execFileSync("git", ["init", "--bare", "-q", remote], {
			env,
			encoding: "utf-8",
		});
		fs.mkdirSync(a, { recursive: true });
		git(a, ["init", "-q"]);
		ident(a, "smoke-user");
		git(a, ["remote", "add", "origin", remote]);
		fs.writeFileSync(path.join(a, "README.md"), "# fixture\n");
		git(a, ["add", "README.md"]);
		git(a, ["commit", "-q", "-m", "init"]);
		git(a, ["push", "-q", "-u", "origin", "HEAD"]);
		assert.equal(run(a, ["init"]).status, 0, "init 应成功");
		const ns = { TASK_LEDGER_NO_SYNC: "1" };
		for (const t of wanted)
			assert.equal(
				run(a, ["new", "--title", t, "--self"], ns).status,
				0,
				`new ${t} 应成功`,
			);
		git(a, ["add", "ledger"]);
		git(a, ["commit", "-q", "-m", "chore(ledger): fixture 任务"]);
		git(a, ["push", "-q"]);
		execFileSync("git", ["clone", "-q", remote, b], { env, encoding: "utf-8" });
		ident(b, "smoke-user");
		const tasks = () =>
			JSON.parse(
				fs.readFileSync(path.join(a, "ledger", "progress.json"), "utf-8"),
			).tasks;
		const idOf = (title) =>
			Object.keys(tasks()).find((id) => tasks()[id].title === title);
		return { base, a, b, tasks, idOf, remote, ns };
	};
	try {
		// A：a 关掉一个任务（删末尾一行）+ b 新建一个任务（末尾加一行）—— 行级合并必撞
		const A = setup("diff", ["T1", "T2", "T3"]);
		assert.equal(
			run(A.a, ["close", "--id", A.idOf("T3"), "--summary", "夹具"], A.ns)
				.status,
			0,
			"close 应成功",
		);
		git(A.a, ["add", "ledger"]);
		git(A.a, ["commit", "-q", "-m", "chore(ledger): a 结案"]);
		assert.equal(
			run(A.b, ["new", "--title", "T4", "--self"], A.ns).status,
			0,
			"b new 应成功",
		);
		git(A.b, ["add", "ledger"]);
		git(A.b, ["commit", "-q", "-m", "chore(ledger): b 新建"]);
		git(A.b, ["push", "-q"]);
		const merged = run(A.a, [
			"log",
			"--id",
			A.idOf("T1"),
			"--note",
			"触发合并",
		]);
		assert.equal(merged.status, 0, `不同任务应自动合上：${merged.stderr}`);
		assert.ok(
			merged.stderr.includes("按任务号"),
			`应说明是按任务合并：${merged.stderr}`,
		);
		assert.deepEqual(
			Object.values(A.tasks())
				.map((t) => t.title)
				.sort(),
			["T1", "T2", "T4"],
			"T3 该没、T4 该在",
		);
		assert.ok(
			!fs
				.readFileSync(path.join(A.a, "ledger", "progress.json"), "utf-8")
				.includes("<<<<<<<"),
			"合上了就不该留冲突标记",
		);
		assert.equal(git(A.a, ["status", "--porcelain"]), "", "合并后工作区应干净");

		// B：两台机器各改同一个任务 —— 必须报冲突，不许静默选一个
		const B = setup("same", ["S1", "S2"]);
		const s2 = B.idOf("S2");
		const s2Log = B.tasks()[s2].worklog; // 冲突后 progress.json 不再是合法 JSON，路径得先记下
		// 两次 log 要隔着 1 秒：时间戳同秒时两个版本字节完全相同，那本来就该判成没冲突。
		execFileSync("sleep", ["1.1"], { env });
		assert.equal(
			run(B.a, ["log", "--id", s2, "--note", "家里改的"], B.ns).status,
			0,
			"a log 应成功",
		);
		git(B.a, ["add", "ledger"]);
		git(B.a, ["commit", "-q", "-m", "chore(ledger): 家里改"]);
		execFileSync("sleep", ["1.1"], { env });
		assert.equal(
			run(B.b, ["log", "--id", s2, "--note", "公司改的"]).status,
			0,
			"b log 应成功",
		);
		const clash = run(B.a, ["log", "--id", s2, "--note", "家里再改"]);
		assert.equal(clash.status, 1, `同一任务两边改应中止：${clash.stderr}`);
		assert.ok(
			clash.stderr.includes("两边同时改过"),
			`应说清是同任务冲突：${clash.stderr}`,
		);
		const progressText = fs.readFileSync(
			path.join(B.a, "ledger", "progress.json"),
			"utf-8",
		);
		assert.ok(
			progressText.includes("<<<<<<< 本地"),
			"冲突任务要标出来，不能静默选",
		);
		assert.ok(progressText.includes(">>>>>>> 远端"), "冲突任务要标出远端版本");
		const wl = fs.readFileSync(path.join(B.a, "ledger", s2Log), "utf-8");
		assert.ok(
			wl.includes("家里改的") && wl.includes("公司改的"),
			"worklog 两边记录都得保住",
		);
		assert.ok(!wl.includes("<<<<<<<"), "worklog 是追加式正文，不该留冲突标记");
	} finally {
		for (const dir of bases) fs.rmSync(dir, { recursive: true, force: true });
	}
});

// 写后同步的边界（2026-10-21 红队评审 A 类）：只提交台账、失败回滚写前刷新、中间态不写。
await check(
	"写后同步：不吞暂存区 / 失败回滚写前刷新 / 冲突中间态中止",
	async () => {
		const { execFileSync, spawnSync } = await import("node:child_process");
		const script = path.join(here, "../skill/scripts/progress.py");
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "dtl-syncguard-"));
		const remote = path.join(base, "remote.git");
		const a = path.join(base, "a");
		const b = path.join(base, "b");
		const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
		const git = (cwd, args) =>
			execFileSync("git", args, { cwd, env, encoding: "utf-8" }).trim();
		const run = (cwd, args) =>
			spawnSync("python3", [script, ...args, "--repo", cwd], {
				cwd,
				env,
				encoding: "utf-8",
			});
		const ident = (dir, name) => {
			git(dir, ["config", "user.name", name]);
			git(dir, ["config", "user.email", "smoke@example.com"]);
		};
		try {
			execFileSync("git", ["init", "--bare", "-q", remote], {
				env,
				encoding: "utf-8",
			});
			fs.mkdirSync(a, { recursive: true });
			git(a, ["init", "-q"]);
			ident(a, "smoke-user");
			git(a, ["remote", "add", "origin", remote]);
			fs.writeFileSync(path.join(a, "README.md"), "# fixture\n");
			git(a, ["add", "README.md"]);
			git(a, ["commit", "-q", "-m", "init"]);
			git(a, ["push", "-q", "-u", "origin", "HEAD"]);
			assert.equal(run(a, ["init"]).status, 0, "init 应成功");
			assert.equal(
				run(a, ["new", "--title", "同步边界任务", "--self"]).status,
				0,
				"new 应成功",
			);
			const progressPath = path.join(a, "ledger", "progress.json");
			const tasks = () =>
				JSON.parse(fs.readFileSync(progressPath, "utf-8")).tasks;
			const taskId = Object.keys(tasks())[0];

			// ① 只提交台账：用户已经 git add 的业务文件不能被卷进 chore(ledger) 提交
			fs.writeFileSync(path.join(a, "biz.txt"), "business\n");
			git(a, ["add", "biz.txt"]);
			assert.equal(
				run(a, ["log", "--id", taskId, "--note", "冒烟：不吞暂存区"]).status,
				0,
				"log 应成功",
			);
			const committed = git(a, ["show", "--name-only", "--format=", "HEAD"]);
			assert.ok(
				!committed.includes("biz.txt"),
				`台账提交不该含业务文件：${committed}`,
			);
			assert.ok(
				git(a, ["status", "--porcelain"]).split("\n").includes("A  biz.txt"),
				"业务文件应仍留在暂存区",
			);
			git(a, ["reset", "-q", "biz.txt"]);
			fs.rmSync(path.join(a, "biz.txt"), { force: true });

			// 一个任务一行：任务块占十几行时，删/改相邻任务的 patch 上下文会重叠，rebase 必冲突
			const rawProgress = fs.readFileSync(progressPath, "utf-8");
			const taskLines = rawProgress
				.split("\n")
				.filter((line) => line.startsWith('    "'));
			assert.equal(
				taskLines.length,
				Object.keys(tasks()).length,
				"progress.json 应一个任务一行",
			);

			// ② 命令失败要回滚写前刷新，不能把远端版本留在工作树里冒充用户的未提交改动
			execFileSync("git", ["clone", "-q", remote, b], {
				env,
				encoding: "utf-8",
			});
			ident(b, "smoke-other");
			assert.equal(
				run(b, ["new", "--title", "他人推进远端", "--self"]).status,
				0,
				"他人 new 应成功",
			);
			const failed = run(a, [
				"log",
				"--id",
				"no-such-task-zzzz",
				"--note",
				"应失败",
			]);
			assert.equal(failed.status, 1, "不存在的任务应失败");
			// 写前同步可能已经 fast-forward 到远端（那是共享状态推进，不回滚）；
			// 该回滚的是「脚本主动写进工作树的内容」——两者都表现为「失败后工作树必须干净」。
			assert.equal(
				git(a, ["status", "--porcelain"]),
				"",
				"失败后工作树应干净（预同步写下的内容已回滚）",
			);

			// ③ 用户自己 commit 的代码不碰：本地有非台账提交 + 远端有新提交 ⇒ 不自动 rebase（会改写它们的提交号），
			// 推送前把「会一并带走什么」说清楚，业务提交绝不进远端
			fs.writeFileSync(path.join(a, "biz.txt"), "user business code\n");
			git(a, ["add", "biz.txt"]);
			git(a, ["commit", "-q", "-m", "feat: 用户自己的业务提交"]);
			const branch = git(a, ["rev-parse", "--abbrev-ref", "HEAD"]);
			assert.equal(
				run(b, ["new", "--title", "他人再推一个", "--self"]).status,
				0,
				"他人应能再推",
			);
			const foreign = run(a, [
				"log",
				"--id",
				taskId,
				"--note",
				"冒烟：业务提交不被动",
			]);
			assert.equal(
				foreign.status,
				0,
				`退出码仍应为 0（台账已写成功）：${foreign.stderr}`,
			);
			assert.ok(
				foreign.stderr.includes("你自己的提交"),
				`应说明不会 rebase 用户提交：${foreign.stderr}`,
			);
			assert.ok(
				foreign.stderr.includes("一并推上去"),
				`推送前应告知会带走什么：${foreign.stderr}`,
			);
			assert.ok(
				!git(a, ["log", "--format=%s", `origin/${branch}`]).includes(
					"feat: 用户自己的业务提交",
				),
				"用户的业务提交不该被推到远端（推送已被拒，脚本也没替他 rebase 重试）",
			);
			assert.ok(
				git(a, ["log", "--format=%s"]).includes("feat: 用户自己的业务提交"),
				"用户的业务提交应原样留在本地",
			);

			// ④ merge / rebase 中间态：不许往冲突现场里写
			fs.writeFileSync(
				path.join(a, ".git", "MERGE_HEAD"),
				`${git(a, ["rev-parse", "HEAD"])}\n`,
			);
			const mid = run(a, ["log", "--id", taskId, "--note", "冒烟：中间态"]);
			assert.equal(mid.status, 1, "中间态应中止");
			assert.ok(
				mid.stderr.includes("中间态"),
				`应明确提示中间态：${mid.stderr}`,
			);
			fs.rmSync(path.join(a, ".git", "MERGE_HEAD"), { force: true });
		} finally {
			fs.rmSync(base, { recursive: true, force: true });
		}
	},
);

// 写前同步的目标范围（结构断言）：历史层不再整目录枚举，只在 close 时按结案月取一个文件。
// 运行时区分不开「rebase 带进来的历史文件」与「presync 主动刷的」，所以从源码层面守。
await check("写前同步只定向刷目标文件：history 不整目录枚举", async () => {
	const src = fs.readFileSync(
		path.join(here, "../skill/scripts/progress.py"),
		"utf-8",
	);
	assert.ok(
		!/_remote_dir_files\([^)]*history/.test(src),
		"历史层不该用 _remote_dir_files 整目录枚举",
	);
	assert.ok(
		/if action == "close":/.test(src) &&
			/history_path_for\(repo, now\(\)\)/.test(src),
		"历史层目标应按 close 的结案月计算（含 --finished 兜底）",
	);
});

// 内嵌副本与源一致：忘了 build:host 就会被这条抓住（收的是「改了源没同步」的常见失误）。
await check("内嵌 skill 副本与 packages/skill 源逐字节一致", async () => {
	const { diffSkillCopy } = await import("./check-skill-copy.mjs");
	const { missing, extra, differing } = diffSkillCopy();
	assert.deepEqual(
		missing,
		[],
		`副本缺文件（先 npm run build:host）：${missing.join(", ")}`,
	);
	assert.deepEqual(
		extra,
		[],
		`副本多出文件（先 npm run build:host）：${extra.join(", ")}`,
	);
	assert.deepEqual(
		differing,
		[],
		`副本与源不一致（先 npm run build:host）：${differing.join(", ")}`,
	);
});

// 客户端数据面（步骤 4b）：取数只走拆后的两个端点，页面不许再从快照上读趋势。
// 这是「首屏不等 history」的前端一半——host 拆了端点但页面还读 board.trend，等于白拆。
await check(
	"客户端数据面：只走 /board/snapshot + /board/trend，趋势不再挂在快照上（步骤 4b）",
	async () => {
		const { readFile } = await import("node:fs/promises");
		const apiSrc = await readFile(
			path.resolve(here, "../src/client/api.ts"),
			"utf-8",
		);
		assert.ok(
			apiSrc.includes("/board/snapshot"),
			"api.ts 应有快路径取数（/board/snapshot）",
		);
		assert.ok(
			apiSrc.includes("/board/trend"),
			"api.ts 应有慢路径取数（/board/trend）",
		);
		assert.ok(
			apiSrc.includes("fresh=1"),
			"手动刷新应带 fresh=1（不吃 host 的 1.5s 读缓存）",
		);
		assert.ok(
			!/fetchJson<\s*BoardPayload\s*>\(\s*'\/board'\s*\)/.test(apiSrc),
			"api.ts 不得再取全量 /board（兼容端点只留给旧 client）",
		);
		const home = await readFile(
			path.resolve(here, "../src/client/board-home.ts"),
			"utf-8",
		);
		assert.ok(
			home.includes("state.trend"),
			"页面趋势应来自 store 的 trend（慢路径）",
		);
		assert.ok(
			!/\bboard\??\.(?:closed|trend)\b/.test(home),
			"页面不得再从快照读 closed / trend（快路径已瘦身）",
		);
	},
);

// 分层铁律的结构断言（重构护栏）：IO 只在 repositories/ 与 skill/，依赖方向单向。
// 这条挡住「以后再写一处 existsSync('ledger/...')」或「service 反向 import routes」。
await check(
	"结构断言：IO 唯一出口 + 依赖方向单向 + host/client 隔离",
	async () => {
		const { readdirSync, readFileSync, statSync } = await import("node:fs");
		const hostDir = path.resolve(here, "../dist/host");
		const files = [];
		const walk = (dir) => {
			for (const name of readdirSync(dir)) {
				const target = path.join(dir, name);
				if (statSync(target).isDirectory()) walk(target);
				else if (name.endsWith(".js")) files.push(target);
			}
		};
		walk(hostDir);
		const rel = (file) =>
			path.relative(hostDir, file).split(path.sep).join("/");
		// tsc 保留注释 ⇒ 先剥注释再匹配（「唯一 spawn python3」这类注释会造成假阳性）
		const strip = (text) =>
			text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
		const PROC = /\b(?:spawn|execFile|execSync|fork)\s*\(|node:child_process/;
		const FS =
			/\b(?:readFile|readFileSync|writeFile|writeFileSync|existsSync|mkdir|rm|opendir|appendFile)\s*\(|node:fs/;
		// 台账 IO 白名单：runner=python3、identity.repository=git、ledger.repository=fs、skill/registration=读内嵌 SKILL.md
		const ALLOW = new Set([
			"repositories/runner.js",
			"repositories/identity.repository.js",
			"repositories/ledger.repository.js",
			"skill/registration.js",
		]);
		for (const file of files) {
			const r = rel(file);
			const code = strip(readFileSync(file, "utf-8"));
			if (ALLOW.has(r)) {
				// 反向：白名单内也不许多出第二种 IO
				if (
					r === "repositories/runner.js" ||
					r === "repositories/identity.repository.js"
				) {
					assert.ok(!FS.test(code), `${r} 只许起进程，不许碰 fs`);
				} else {
					assert.ok(!PROC.test(code), `${r} 只许碰 fs，不许起进程`);
				}
			} else {
				assert.ok(
					!PROC.test(code) && !FS.test(code),
					`${r} 出现 IO——唯一出口在 repositories/ 与 skill/`,
				);
			}
			const requires = [...code.matchAll(/require\("([^"]+)"\)/g)].map(
				(m) => m[1],
			);
			if (r.startsWith("services/") || r.startsWith("repositories/")) {
				assert.ok(
					!requires.some((x) => x.includes("routes")),
					`${r} 不得 import routes（依赖方向单向）`,
				);
			}
			assert.ok(
				!requires.some((x) => x.includes("client")),
				`${r} 不得 import client（host/client 隔离）`,
			);
		}
	},
);

console.log(`\n${passed} 项通过${process.exitCode ? "（有失败）" : ""}`);
