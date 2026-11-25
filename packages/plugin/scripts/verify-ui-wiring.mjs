/**
 * UI 接线自检（构建期静态检查）：防止「投递端用了、渲染端没挂」再次静默发生。
 *
 * 核心的 notify / toast / tooltip / 默认项目都是「显式调用一次才生效」的接线：
 * notify() 只入队、没 mountToasts() 就永远不显示，且核心本地路径无告警。
 * 这类能力必须走唯一出口 ./ui（投递）与 ui-init.ts（初始化），业务文件不许绕过。
 *
 * 不检查普通控件（Button/Chip/Picker 等）的直引 —— 那是本项目既定惯例（见 ui.ts 头注），
 * 它们没有初始化契约，与本检查无关。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const clientDir = join(root, 'src', 'client');

/** 有初始化契约、必须经统一出口/入口的核心子路径。 */
const WIRED_SUBPATHS = [
  'dsh-plugin-core/ui/notify',
  'dsh-plugin-core/ui/toast',
  'dsh-plugin-core/ui/tooltip',
  'dsh-plugin-core/runtime',
];

/** 允许直引上述子路径的文件（相对 src/client）：装配层与初始化层本身。 */
const ALLOWED = new Set(['index.ts', 'ui-init.ts', 'ui.ts']);

function listTs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** 去掉行注释 / 块注释，避免注释里写的 `notify()` 触发误报。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const problems = [];
const files = listTs(clientDir);

for (const file of files) {
  const rel = relative(clientDir, file).replaceAll('\\', '/');
  const text = stripComments(readFileSync(file, 'utf8'));

  // ① 只有装配层 / 初始化层 / 唯一出口能直引有接线契约的核心子路径。
  if (!ALLOWED.has(rel)) {
    for (const sub of WIRED_SUBPATHS) {
      if (text.includes(`from "${sub}"`) || text.includes(`from '${sub}'`)) {
        problems.push(`${rel}: 直引 ${sub}；notify/toast/tooltip/runtime 必须走 ./ui 与 ./ui-init`);
      }
    }
  }

  // ② 调用 notify(...) 的文件必须从 ./ui 导入 notify（否则可能拿到未接线的副本）。
  if (/\bnotify\s*\(/.test(text) && rel !== 'ui.ts' && rel !== 'ui-init.ts') {
    const hasNotifyImport = /import\s*\{[^}]*\bnotify\b[^}]*\}\s*from\s*["']\.\/ui["']/s.test(text);
    if (!hasNotifyImport) problems.push(`${rel}: 调用 notify() 但未从 ./ui 导入`);
  }
}

// ③ apply() 必须调 initClientUi()：缺了它全部 Toast 静默死投递。
const indexPath = join(clientDir, 'index.ts');
const indexText = readFileSync(indexPath, 'utf8');
if (!/initClientUi\s*\(\s*\)/.test(indexText) || indexText.includes('// initClientUi();')) {
  problems.push('index.ts: apply() 未调用 initClientUi()');
}

// ④ 初始化入口必须真正挂上三件：Toaster 宿主、广播接收、默认分组。
const initPath = join(clientDir, 'ui-init.ts');
const initText = readFileSync(initPath, 'utf8');
for (const [name, pattern] of [
  ['mountToasts', /\bmountToasts\s*\(\s*\)/],
  ['connectToasts', /\bconnectToasts\s*\(\s*\)/],
  ['setDefaultTaskProject', /\bsetDefaultTaskProject\s*\(/],
  ['setTooltipRenderer', /\bsetTooltipRenderer\s*\(/],
]) {
  if (!pattern.test(initText)) problems.push(`ui-init.ts: 缺少 ${name}() 接线`);
}

// ⑤ 后台结案披露：progress 只有一个服务端写入口，弹窗与 TaskBar 读同一字段。
const hostDir = join(root, 'src', 'host');
const readSource = (path) => stripComments(readFileSync(path, 'utf8'));
const storeText = readSource(join(hostDir, 'services', 'session-job.store.ts'));
if (!/reportProgress\s*\(key:\s*string,\s*message:\s*string\)/.test(storeText)) {
  problems.push('session-job.store.ts: 缺 reportProgress 单一写入口');
}
const progressService = readSource(join(hostDir, 'services', 'session-progress.service.ts'));
if (!/on\(['"]session\/event['"]/.test(progressService) || !/step\/start/.test(progressService)) {
  problems.push('session-progress.service.ts: 未订阅 session/event 的 step/start');
}
const sessionText = readSource(join(hostDir, 'services', 'session.service.ts'));
const entryText = readSource(join(root, 'src', 'index.ts'));
if (!/reportProgress\(job\.key/.test(sessionText)) {
  problems.push('session.service.ts: 未调用 jobs.reportProgress');
}
if (!/installSessionProgress\(ctx, jobs\)/.test(entryText) || !/\bprogress,\s*$/m.test(entryText)) {
  problems.push('index.ts: 未安装并注入 progress tracker');
}
const taskRowText = readSource(join(clientDir, 'task-row.ts'));
if (!/progressMessage \?\? t\(['"]closingNotice['"]\)/.test(taskRowText)) {
  problems.push('task-row.ts: 结案弹窗 notice 未读 TaskRecord.progress.message');
}
if (!/progressTexts:/.test(taskRowText)) {
  problems.push('task-row.ts: startTask 未透传阶段文案');
}

// ⑥ 直接结案也走后台作业：两条路径共用作业键，按 kind 分派，五阶段写同一 progress。
const directService = readSource(join(hostDir, 'services', 'direct-close.service.ts'));
if (!/isDirectCloseTexts/.test(directService) || !/startWriteJob\(/.test(directService)) {
  problems.push('direct-close.service.ts: 直接结案未退化为通用写命令执行体的薄封装');
}
const writeService = readSource(join(hostDir, 'services', 'write-job.service.ts'));
if (!/jobs\.reportProgress\(job\.input\.key, job\.input\.texts\[step\]\)/.test(writeService)) {
  problems.push('write-job.service.ts: 写命令未把 skill 五阶段写入 progress');
}
if (!/kind: ['"]close-direct['"]/.test(taskRowText)) {
  problems.push('task-row.ts: 直接结案未提交 close-direct 后台作业');
}
if (!/rowButtons\(kind\)/.test(storeText) || !/kind === ['"]close-agent['"]/.test(storeText)) {
  problems.push('session-job.store.ts: 未按作业类型决定是否挂查看会话按钮');
}

// ⑦ 认领 / 释放 / 取消 / 删除 / 历史删除统一走后台：动作独立 key、kind 分派、参数提交期校验。
const apiText = readSource(join(clientDir, 'api.ts'));
for (const helper of ['claimJobKey', 'releaseJobKey', 'cancelJobKey', 'deleteJobKey', 'deleteHistJobKey']) {
  if (!new RegExp(`export function ${helper}\\(`).test(apiText)) {
    problems.push(`api.ts: 缺动作独立作业键 ${helper}()`);
  }
}
for (const [name, pattern] of [
  ['claimJobKey', /claimJobKey\(row\.task\.id\)/],
  ['认领后台执行按钮', /locked: claimRunning/],
  ['releaseJobKey', /releaseJobKey\(row\.task\.id\)/],
  ['cancelJobKey', /cancelJobKey\(row\.task\.id\)/],
  ['deleteJobKey', /deleteJobKey\(row\.task\.id\)/],
  ['startWrite', /await startWrite\(/],
  ['同一行作业禁用', /disabled: busy \|\| anyJobRunning/],
]) {
  if (!pattern.test(taskRowText)) problems.push(`task-row.ts: 缺 ${name} 的后台接线`);
}
const historyText = readSource(join(clientDir, 'history-list.ts'));
if (!/kind: ['"]delete-hist['"]/.test(historyText) || !/deleteHistJobKey\(/.test(historyText)) {
  problems.push('history-list.ts: 历史行删除未提交 delete-hist 后台作业');
}
if (!/deleteRunningOf\(record\)/.test(historyText)) {
  problems.push('history-list.ts: 运行中的历史行删除按钮未禁用');
}
if (!/monthCache\.current\.clear\(\)/.test(historyText) || !/props\.onDeleted\(\)/.test(historyText)) {
  problems.push('history-list.ts: 后台删除终态未清缓存与刷新统计');
}
const writeUiText = readSource(join(clientDir, 'write-job-ui.ts'));
if (!/WRITE_JOB_KEY_PREFIXES/.test(writeUiText) || !/WRITE_JOB_KEY_PREFIXES/.test(readSource(join(clientDir, 'board-home.ts')))) {
  problems.push('write-job-ui.ts / board-home.ts: onSettled 未按动作前缀集合放宽');
}
if (!/completionTexts/.test(entryText) || !/isWriteJobTexts\(/.test(entryText)) {
  problems.push('index.ts: submit 未校验写命令阶段文案与终态文案');
}
if (!/checkHistoryDelete\(/.test(entryText) || !/parseDeleteHistKey\(/.test(entryText)) {
  problems.push('index.ts: submit 缺历史删除参数校验');
}
// 历史删除一律按任务号定位，不许把 src / 行号 / 指纹跨进程传给 skill。
const histRepo = readSource(join(hostDir, 'repositories', 'history.repository.ts'));
if (!histRepo.includes('const taskId = monthAndName') || !histRepo.includes('worklog')) {
  problems.push('history.repository.ts: 未从 worklog 路径反推任务号');
}
if (/fingerprint/.test(readSource(join(hostDir, 'repositories', 'task.repository.ts')))) {
  problems.push('task.repository.ts: 删除仍在传行指纹，应按任务号定位');
}
// 失败 toast 必须把真实原因补进 toast.failure.title；核心不显示 TaskRecord.reason。
if (!/withFailureReason\(current\.toast, input\.reason/.test(storeText)) {
  problems.push('session-job.store.ts: settle 失败时未把原因补进 toast 文案');
}
const paramsText = readSource(join(hostDir, 'services', 'task-action-params.ts'));
if (!/checkHistoryDelete/.test(paramsText) || !/parseDeleteHistKey/.test(paramsText)) {
  problems.push('task-action-params.ts: 缺历史删除公共校验');
}
if (!/completionTexts\?: CompletionTexts/.test(storeText)) {
  problems.push('session-job.store.ts: 终态文案未按动作参数化');
}
const localeText = readSource(join(clientDir, 'locales.ts'));
for (const key of ['releaseTaskCategory', 'cancelTaskCategory', 'deleteTaskCategory', 'deleteHistoryCategory', 'writeReleaseDone', 'writeCancelDone', 'writeDeleteDone']) {
  const occurrences = localeText.split(key).length - 1;
  if (occurrences < 3) problems.push(`locales.ts: ${key} 缺中英双档或类型声明`);
}

if (problems.length > 0) {
  console.error('[verify-ui-wiring] FAIL:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[verify-ui-wiring] PASS ${files.length} 个 client 文件：UI 接线经唯一出口与统一初始化入口`);
