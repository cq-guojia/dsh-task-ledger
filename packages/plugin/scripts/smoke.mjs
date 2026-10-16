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
  assert.ok(tasks.length >= 6, `在办应 ≥6，实际 ${tasks.length}`)
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

console.log(`\n${passed} 项通过${process.exitCode ? '（有失败）' : ''}`)
