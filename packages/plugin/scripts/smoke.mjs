// 冒烟（任务 3「后端方法抽象」）：对真实 + 合成台账全链路验证 host 方法。
// 跑法：先 npm run build（tsc + copy-skill），再 node scripts/smoke.mjs——打的是 dist 产物。
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

const { resolveWorkspaces } = await import('../dist/host/workspace.js')
const { readTasks, getTask, readWorklog } = await import('../dist/host/ledger-read.js')
const { getHomeAggregate, getBoardSnapshot, queryClosed, getFilterOptions } = await import('../dist/host/board.js')
const { runLedgerScript } = await import('../dist/host/script.js')

let passed = 0
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; console.log(`  ✓ ${name}`) },
    (error) => { console.error(`  ✗ ${name}\n    ${error.message}`); process.exitCode = 1 },
  )
}

const registry = [
  { id: 'ws-self', title: 'dsh-task-ledger（本仓）', path: repoRoot },
  { id: 'ws-dispatch', title: 'dsh-task-dispatch-table', path: path.resolve(repoRoot, '../dsh-task-dispatch-table') },
  { id: 'ws-big', title: 'perf-50k（合成）', path: '/tmp/perf2' },
  { id: 'ws-none', title: '无台账（/tmp）', path: '/tmp' },
]

console.log('smoke: 后端方法抽象')

await check('resolveWorkspaces：只返回有 progress.json 的（未初始化/无台账被过滤）', async () => {
  const found = resolveWorkspaces(registry)
  const ids = found.map((w) => w.id)
  assert.deepEqual(ids, ['ws-self', 'ws-dispatch'])
})

await check('readTasks：在办任务带 id 与 workspace', async () => {
  const tasks = await readTasks({ id: 'ws-self', title: 'self', path: repoRoot })
  // 只卡「有在办」，不写死条数：本仓台账会被日常结案改变，条数是数据不是契约
  // （结构断言才是这条冒烟要守的东西）。
  assert.ok(tasks.length >= 1, `本仓应有在办任务，实际 ${tasks.length}`)
  for (const task of tasks) {
    assert.ok(typeof task.id === 'string' && task.id !== '')
    assert.equal(task.workspace.id, 'ws-self')
  }
})

await check('readTasks 错误路径：无 progress.json 的工作区抛人话错误', async () => {
  await assert.rejects(
    () => readTasks({ id: 'x', title: 'x', path: '/tmp' }),
    /progress\.json/,
  )
})

await check('getBoardSnapshot：统计与任务行（与历史量无关的热路径）', async () => {
  const started = Date.now()
  const snapshot = await getBoardSnapshot([
    { id: 'ws-self', title: 'self', path: repoRoot },
    { id: 'ws-dispatch', title: 'dispatch', path: path.resolve(repoRoot, '../dsh-task-dispatch-table') },
  ])
  const elapsed = Date.now() - started
  console.log(`    （耗时 ${elapsed}ms；在办 ${snapshot.tasks.length} 条，我的 ${snapshot.stats.myActive}，待认领 ${snapshot.stats.open}）`)
  assert.ok(snapshot.tasks.length >= 6)
  assert.ok(Number.isInteger(snapshot.stats.myActive) && snapshot.stats.myActive >= 0)
  assert.ok(snapshot.stats.open >= 4)
  assert.equal(snapshot.stats.staleDays, 14, '停滞阈值应随响应下发（14 天）')
  assert.equal(typeof snapshot.stats.oldestOpenDays, 'number', '最老待认领天数应是数字')
  for (const task of snapshot.tasks) {
    assert.equal(typeof task.stale, 'boolean', '每行都应带 host 判好的 stale 标记')
    if (task.status === 'open') assert.equal(task.ageDays, null, '待认领不算「认领后未动」')
  }
  assert.ok(elapsed < 2000, `热路径应 <2s，实际 ${elapsed}ms`)
})

await check('getHomeAggregate：近 8 周分组桶（完成 / 新增 × 所有 / 我的）+ 四个自然周期', async () => {
  const home = await getHomeAggregate([{ id: 'ws-self', title: 'self', path: repoRoot }])
  for (const scope of ['all', 'mine']) {
    const buckets = home.closed.weekly[scope]
    assert.equal(buckets.length, 8, `${scope} 应 8 桶`)
    assert.deepEqual(buckets.map((b) => b.week), [...buckets.map((b) => b.week)].sort(), '桶按周升序')
    for (const bucket of buckets) {
      assert.ok(Number.isInteger(bucket.done) && bucket.done >= 0)
      assert.ok(Number.isInteger(bucket.created) && bucket.created >= 0)
      assert.ok(Number.isInteger(bucket.remaining) && bucket.remaining >= 0, `${scope} remaining 应是非负整数`)
      // x 轴标注 = 周截止日：历史周 = 周一+6（周日）；当前周 = 今天。数据按截止日判，故标它。
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(bucket.end), `${scope} end 应为 YYYY-MM-DD`)
      assert.ok(bucket.end >= bucket.week, `${scope} end 应不早于周一`)
    }
    // 末桶（当前周）end = 今天；其余 end = 周一 + 6 天（host 用本地日期，测试同步本地，避免 toISOString 的 UTC 偏移）
    const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const addDays = (ymdStr, n) => { const d = new Date(`${ymdStr}T00:00:00`); d.setDate(d.getDate() + n); return ymdLocal(d) }
    const today = ymdLocal(new Date())
    buckets.forEach((bucket, i) => {
      if (i === buckets.length - 1) assert.equal(bucket.end, today, `${scope} 当前周 end 应为今天`)
      else assert.equal(bucket.end, addDays(bucket.week, 6), `${scope} 历史周 end 应为周一+6（周日）`)
    })
    // remaining 自洽不变量（严谨版）：定义基线_i = remaining_i − Σcreated[0..i] + Σdone[0..i]
    // = 窗口前创建、且到周末 i 仍未结案的任务数。该集合只减不增 ⇒ 基线_i 单调不增且 ≥ 0。
    // （旧版断言「恒定」只在「无窗口前任务在窗口内结案」时巧合成立，并非一般正确。）
    let prevBaseline = null
    let cumCreated = 0
    let cumDone = 0
    buckets.forEach((bucket, i) => {
      cumCreated += bucket.created
      cumDone += bucket.done
      const baseline = bucket.remaining - cumCreated + cumDone
      assert.ok(baseline >= 0, `${scope} remaining 自洽：基线 ≥ 0 @周${i}`)
      if (prevBaseline !== null) assert.ok(baseline <= prevBaseline, `${scope} remaining 自洽：基线单调不增 @周${i}`)
      prevBaseline = baseline
    })
  }
  // 「我的」不可能超过「所有」
  for (let i = 0; i < 8; i += 1) {
    assert.ok(home.closed.weekly.mine[i].done <= home.closed.weekly.all[i].done, 'mine 不应超过 all')
    assert.ok(home.closed.weekly.mine[i].created <= home.closed.weekly.all[i].created, 'mine 不应超过 all')
    assert.ok(home.closed.weekly.mine[i].remaining <= home.closed.weekly.all[i].remaining, 'mine 不应超过 all')
  }
  // 最后一桶 = 本周一（host 同口径）
  const now = new Date()
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const pad = (n) => String(n).padStart(2, '0')
  assert.equal(home.closed.weekly.all[7].week, `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`)
  // 四个自然周期：done / created / from / to 齐备，且区间合法
  const trend = home.trend
  for (const [name, period] of Object.entries(trend)) {
    assert.ok(Number.isInteger(period.done) && period.done >= 0, `${name}.done 应是非负整数`)
    assert.ok(Number.isInteger(period.created) && period.created >= 0, `${name}.created 应是非负整数`)
    assert.ok(period.from <= period.to, `${name} 区间应 from <= to（${period.from} ~ ${period.to}）`)
  }
  assert.equal(trend.thisWeek.to, trend.thisMonth.to, '本周 / 本月都截止到今天')
  assert.ok(trend.lastWeek.to < trend.thisWeek.from, '上周应结束在本周开始之前')
  assert.ok(trend.lastMonth.to < trend.thisMonth.from, '上月应结束在本月开始之前')
  // 新增必须合并两个来源：本仓有在办（progress.json）+ 已结案（history），两者都该被数到
  assert.ok(trend.thisMonth.created >= trend.thisWeek.created, '本月新增 ≥ 本周新增')
  console.log(`    （近 8 周完成 all=${home.closed.weekly.all.map((b) => b.done).join('/')}；本周/上周/本月/上月完成=${trend.thisWeek.done}/${trend.lastWeek.done}/${trend.thisMonth.done}/${trend.lastMonth.done}）`)
})

await check('queryClosed：近 13 个月窗口 + 创建时间倒序 + limit', async () => {
  const records = await queryClosed([
    { id: 'ws-self', title: 'self', path: repoRoot },
    { id: 'ws-dispatch', title: 'dispatch', path: path.resolve(repoRoot, '../dsh-task-dispatch-table') },
  ])
  assert.ok(records.length > 8, `两仓合并应 >8，实际 ${records.length}`)
  for (const record of records) assert.ok(record.workspace !== undefined)
  const keys = records.map((r) => String(r.created ?? r.time ?? ''))
  assert.deepEqual(keys, [...keys].sort().reverse(), '应按创建时间倒序')
  const limited = await queryClosed([{ id: 'ws-self', title: 'self', path: repoRoot }], { limit: 3 })
  assert.equal(limited.length, 3)
})

await check('getFilterOptions：owner/category/tag 去重候选', async () => {
  const options = await getFilterOptions([{ id: 'ws-self', title: 'self', path: repoRoot }])
  assert.ok(options.owners.includes('GuoJia-Agent'), `owners 应含 GuoJia-Agent，实际 ${options.owners.join(',')}`)
  assert.ok(options.categories.includes('建设'))
  assert.ok(options.tags.length > 0)
  console.log(`    （owners=${options.owners.length} categories=${options.categories.length} tags=${options.tags.length}）`)
})

await check('getTask + readWorklog：详情与过程正文', async () => {
  const workspace = { id: 'ws-self', title: 'self', path: repoRoot }
  const tasks = await readTasks(workspace)
  const withLog = tasks.find((task) => Boolean(task.worklog))
  assert.ok(withLog !== undefined, '应存在带 worklog 的在办任务')
  const task = await getTask(workspace, withLog.id)
  assert.ok(task?.id === withLog.id)
  const text = await readWorklog(workspace, task)
  assert.ok(text?.includes('## 背景') === true, '过程文档应含「## 背景」节')
  const missing = await readWorklog(workspace, { ...task, worklog: 'worklog/209901/01-0000-x-0000.md' })
  assert.equal(missing, null, '读不到的过程文档回 null 不炸')
})

await check('runLedgerScript：直调 count-only（合成 5 万行封顶）', async () => {
  const result = await runLedgerScript('history', ['--repo', '/tmp/perf2', '--json', '--count-only', '--months', '13'])
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.count, 10000)
    assert.equal(result.data.capped, true)
  }
})

await check('runLedgerScript 错误路径：不存在的仓库 → 人话错误', async () => {
  const result = await runLedgerScript('list', ['--repo', '/tmp/definitely-not-here'])
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /repo|目录|不存在/)
})

await check('空台账工作区不炸 /board（真机 500 回归：history 无文件时 --json 也必须出 JSON）', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-empty-ledger-'))
  try {
    mkdirSync(path.join(root, 'ledger'), { recursive: true })
    writeFileSync(path.join(root, 'ledger', 'progress.json'), JSON.stringify({
      version: 6,
      tasks: {
        '20261017-1000-fresh-1': {
          title: '空台账工作区', status: 'open', creator: 'tester',
          created: '2026-10-17 10:00:00', worklog: 'worklog/202610/17-1000-fresh-1.md',
        },
      },
    }))
    const ws = [{ id: 'ws-empty', title: '空台账', path: root }]
    // 关键路径：这正是 /board 路由的那一次聚合调用，抛就是整条 500
    const home = await getHomeAggregate(ws)
    assert.equal(home.snapshot.tasks.length, 1, '有 progress.json 就应读到在办')
    assert.equal(home.trend.thisWeek.done, 0, '无历史 ⇒ 本周完成 0，不是抛错')
    assert.equal(home.closed.weekly.all.length, 8)
    // 无历史 ⇒ 完成全 0；新增只有 synthetic 任务自己那一条（它的 created 可能不在本周）
    assert.ok(home.closed.weekly.all.every((bucket) => bucket.done === 0), '无历史 ⇒ 8 个桶完成全 0')
    const createdTotal = home.closed.weekly.all.reduce((sum, bucket) => sum + bucket.created, 0)
    assert.ok(createdTotal <= 1, `无历史 ⇒ 新增只该有 synthetic 那一条，实际 ${createdTotal}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

await check('getBoardSnapshot：identities 按工作区 id 给出当前 git 身份（前端「我的待办」判定源）', async () => {
  const snapshot = await getBoardSnapshot([{ id: 'ws-self', title: 'self', path: repoRoot }])
  const ids = Object.keys(snapshot.identities)
  assert.deepEqual(ids, ['ws-self'], `identities 应按工作区 id 建键，实际 ${JSON.stringify(ids)}`)
  // 本仓有 git 身份 ⇒ 非 null；取不到（非 git 目录）时必须是 null，不许编造。
  assert.ok(snapshot.identities['ws-self'] === null || typeof snapshot.identities['ws-self'] === 'string')
})

// ── client 产物（浏览器半）：契约 + 文案两档对齐 ──
// 打 dist/client.js：它是 dsh 模块内核消费的 CJS 闭包工厂，形状错了插件根本加载不起来，
// 且这种错在类型检查里看不出来（tsc 只认源码）。
await check('dist/client.js：模块加载器契约 + 只 require 平台模块', async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(path.resolve(here, '../dist/client.js'), 'utf-8')
  assert.ok(text.includes('window.__ModuleLoader__.load('), '缺少模块加载器包裹')
  assert.ok(text.includes('id: "dsh-task-ledger"'), '模块 id 应为包名')
  // 末尾还挂着 sourcemap 注释 ⇒ 先摘掉再看收尾。
  const code = text.replace(/\/\/# sourceMappingURL=.*$/m, '').trimEnd()
  assert.ok(code.includes('return module.exports;'), '缺少 factory 返回值')
  assert.ok(code.endsWith('});'), '缺少 factory 收尾')
  const PLATFORM = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
  ])
  const required = [...text.matchAll(/require\("([^"]+)"\)/g)].map(m => m[1])
  const stray = required.filter(name => !PLATFORM.has(name))
  assert.deepEqual(stray, [], `打进包外的 require 运行时必然抛：${stray.join(',')}`)
  assert.ok(required.includes('react'), 'react 应保留为平台 require')
})

// 筛选是首页的核心逻辑，且**只在浏览器里跑** ⇒ 冒烟直测这两个纯函数（无 DOM 依赖；
// 剥类型直读源码，client 单文件产物不可 import）。
await check('客户端两区视图：我的待办 / 按工作区分组 + 状态档 + 工作区下拉 + 关键字', async () => {
  const { selectView } = await import(path.resolve(here, '../src/client/rows.ts'))
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const wsA = { id: 'w1', title: 'A 项目', path: '/tmp/a' }
  const wsB = { id: 'w2', title: 'B 项目', path: '/tmp/b' }
  const today = `${ymd(now)} 10:00:00`
  const tasks = [
    { id: 't1', workspace: wsA, title: '甲任务', status: 'doing', owner: 'me', creator: 'me', created: today, tags: ['DSH'], ageDays: 0, stale: false },
    { id: 't2', workspace: wsB, title: '乙任务', status: 'open', owner: null, created: '2020-01-02 10:00:00', tags: [], ageDays: null, stale: false },
    { id: 't3', workspace: wsB, title: '丙任务', status: 'blocked', owner: 'other', created: today, tags: [], ageDays: 30, stale: true },
  ]
  const state = (query) => ({
    board: { identities: { w1: 'me', w2: null }, tasks, workspaces: [wsA, wsB], stats: {}, closed: {} },
    query,
  })
  const base = { scope: 'all', status: 'all', workspace: '', keyword: '' }
  const ids = (rows) => rows.map(r => r.task.id)
  // 第一区 = 我的（跨工作区）；第二区 = 别人的 + 待认领，按工作区分组
  let view = selectView(state(base))
  assert.deepEqual(ids(view.mine), ['t1'], '第一区只有我名下的 doing/blocked')
  assert.deepEqual(view.groups.map(g => g.workspaceId), ['w2'], '第二区只剩 B 项目（A 的我那款已进第一区，不重复）')
  assert.deepEqual(ids(view.groups[0].rows), ['t3', 't2'], '组内：别人在做的在前、待认领在后')
  assert.equal(view.total, 3)
  // 范围 = 我的 ⇒ 不出第二区
  view = selectView(state({ ...base, scope: 'mine' }))
  assert.deepEqual(ids(view.mine), ['t1'])
  assert.deepEqual(view.groups, [], '「我的」不掺第二区')
  // 状态档：待认领 / 阻塞 / 停滞（停滞由 host 标记，前端不判阈值）
  assert.deepEqual(ids(selectView(state({ ...base, status: 'open' })).groups[0].rows), ['t2'])
  assert.deepEqual(ids(selectView(state({ ...base, status: 'blocked' })).groups[0].rows), ['t3'])
  assert.deepEqual(ids(selectView(state({ ...base, status: 'stale' })).groups[0].rows), ['t3'])
  // 工作区下拉 + 关键字
  const onlyA = selectView(state({ ...base, workspace: 'w1' }))
  assert.equal(onlyA.mine.length + onlyA.groups.length, 1, '选了 A 就只剩 A 的')
  assert.deepEqual(ids(selectView(state({ ...base, keyword: '乙' })).groups[0].rows), ['t2'])
})

await check('文案字典：zh / en 键完全对齐（漏一种语言界面就露键名）', async () => {
  // 纯数据模块、无副作用 ⇒ Node 24 原生剥类型直读源码（产物里键名已被打包压缩，读不出来）。
  const { zh, en } = await import(path.resolve(here, '../src/client/locales.ts'))
  const zk = Object.keys(zh).sort()
  const ek = Object.keys(en).sort()
  assert.deepEqual(ek, zk, `en 与 zh 键不一致：${JSON.stringify(zk.filter(k => !ek.includes(k)).concat(ek.filter(k => !zk.includes(k))))}`)
  assert.ok(zk.length > 40, `键数应 >40，实际 ${zk.length}`)
  for (const [key, value] of Object.entries(zh)) {
    assert.ok(typeof value === 'string' && value !== '', `zh.${key} 为空`)
  }
})

await check('buildSkillRegistration：name/description/正文 + 占位符替换为绝对路径', async () => {
  const { existsSync } = await import('node:fs')
  const { buildSkillRegistration } = await import('../dist/host/skill-registration.js')
  const registration = buildSkillRegistration()
  assert.equal(registration.name, 'task-ledger')
  assert.ok(registration.description.length > 20, 'description 应非空（取自 SKILL.md frontmatter）')
  assert.ok(registration.content.includes('# task-ledger'), '正文应是完整 SKILL.md')
  assert.ok(registration.content.includes('progress.py'), '正文应含脚本调用示例')
  assert.ok(registration.content.includes('claim'), '正文应含子命令说明（claim 等）')
  assert.ok(!registration.content.includes('<本 SKILL.md 所在目录>'), '占位符应全部替换')
  const match = /python3 (\S*progress\.py)/.exec(registration.content)
  assert.ok(match !== null, '正文应含 python3 <路径>/progress.py 命令')
  assert.ok(existsSync(match[1]), `替换后的脚本路径应真实存在：${match[1]}`)
  console.log(`    （${registration.name}｜正文 ${registration.content.length} 字｜脚本 ${match[1]}）`)
})

console.log(`\n${passed} 项通过${process.exitCode ? '（有失败）' : ''}`)
