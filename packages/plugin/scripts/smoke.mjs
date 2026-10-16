// 冒烟（任务 3「后端方法抽象」）：对真实 + 合成台账全链路验证 host 方法。
// 跑法：先 npm run build（tsc + copy-skill），再 node scripts/smoke.mjs——打的是 dist 产物。
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

const { resolveWorkspaces } = await import('../dist/host/workspace.js')
const { readTasks, getTask, readWorklog } = await import('../dist/host/ledger-read.js')
const { getBoardSnapshot, getClosedCounts, queryClosed, getFilterOptions } = await import('../dist/host/board.js')
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
  assert.ok(elapsed < 2000, `热路径应 <2s，实际 ${elapsed}ms`)
})

await check('getClosedCounts：本周/近一年（含 5 万行合成仓封顶 1 万）', async () => {
  const real = await getClosedCounts([{ id: 'ws-self', title: 'self', path: repoRoot }])
  assert.ok(real.yearDone >= 8, `近一年应 ≥8，实际 ${real.yearDone}`)
  assert.equal(real.yearCapped, false)
  const big = await getClosedCounts([{ id: 'ws-big', title: 'big', path: '/tmp/perf2' }])
  assert.equal(big.yearDone, 10000)
  assert.equal(big.yearCapped, true)
  console.log(`    （真实仓：本周 ${real.weekDone} / 近一年 ${real.yearDone}；合成 5 万行仓：封顶 ${big.yearDone} capped=${big.yearCapped}）`)
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
await check('客户端筛选逻辑：档位 / 时间窗 / 标签 / 关键字', async () => {
  const { rangeToDates } = await import(path.resolve(here, '../src/client/format.ts'))
  const { selectRows } = await import(path.resolve(here, '../src/client/rows.ts'))
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  assert.deepEqual(rangeToDates('week'), { since: ymd(monday), until: ymd(now) }, '本周 = 周一 ~ 今天')
  assert.deepEqual(rangeToDates('all'), {}, '全部时间不拼参数')

  const ws = { id: 'w1', title: 'w1', path: '/tmp' }
  const today = `${ymd(now)} 10:00:00`
  const old = '2020-01-02 10:00:00'
  const tasks = [
    { id: 't1', workspace: ws, title: '甲任务', status: 'doing', owner: 'me', creator: 'me', created: today, tags: ['DSH'] },
    { id: 't2', workspace: ws, title: '乙任务', status: 'open', owner: null, created: old, tags: [] },
    { id: 't3', workspace: ws, title: '丙任务', status: 'blocked', owner: 'other', created: today, tags: [] },
  ]
  const state = (query) => ({
    board: { identities: { w1: 'me' }, tasks, workspaces: [ws], stats: {}, closed: {} },
    history: [],
    query,
  })
  const base = { range: 'all', tag: '', keyword: '', limit: 500 }
  const ids = (rows) => rows.map(r => (r.kind === 'task' ? r.task.id : r.record.id))
  // 默认按创建时间倒序（t1 / t3 今天、t2 是 2020 年）
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'all' }))), ['t1', 't3', 't2'])
  // 「我的」= owner 命中该工作区身份 且 doing/blocked
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'mine' }))), ['t1'])
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'open' }))), ['t2'])
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'all', tag: 'DSH' }))), ['t1'])
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'all', keyword: '乙' }))), ['t2'])
  // 时间窗只留今天的（t2 是 2020 年的）
  assert.deepEqual(ids(selectRows(state({ ...base, bucket: 'all', range: 'week' }))), ['t1', 't3'])
  // 已结案档走 history，行 kind = closed
  const closed = selectRows({ ...state({ ...base, bucket: 'closed' }), history: [{ id: 'h1', summary: '完工' }] })
  assert.deepEqual(closed.map(r => r.kind), ['closed'])
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
