/**
 * 注入到会话里的提示词（「继续」与「完成」两条），中英各一份。
 *
 * 两条铁律（用户 2026-11-03 反复纠正后定）：
 *  1. **解耦**：只依赖「任务号」与「task-ledger skill 存在」两件事。不写命令、不写脚本路径、
 *     不写文档章节名、不复述环境 —— skill 或过程文档模板一改，这里不用跟着改。
 *  2. **跟环境语言**：宿主是英文界面时，注入的提示词也得是英文（用户 2026-11-03 明确要求）。
 *     没有 locale code 可取，用自家字典里一条固定文案比对 —— 同一份 `t`，宿主切语言后立即生效。
 *
 * 放在 client 而不是 host：语言只有浏览器半知道，host 拿到的是拼好的成品。
 */
import { en, type Translate } from "./locales";

/** 当前界面语言是不是英文（比对自家字典，不依赖宿主是否暴露 locale code）。 */
function isEnglish(t: Translate): boolean {
	return t("panelTitle") === en.panelTitle;
}

const CONTINUE_ZH: readonly string[] = [
	"请先只读了解任务 `{{id}}` 的当前进度，汇报完停下。",
	"",
	"## 第一步：读",
	"",
	"用 task-ledger skill 查这个任务，按 skill 自己的说明走，不要另拼命令、不要猜脚本路径。",
	"",
	"把任务字段和它指向的过程文档完整读完 —— 要真的打开读，不要只看查询回执的摘要。",
	"",
	"查不到这个任务、或过程文档读不到：把错误原样贴出来就停下，不要换关键词模糊搜，",
	"不要猜任务号，不要另找一份文档顶上，也不要当成已完成来汇报。",
	"",
	"## 第二步：报",
	"",
	"开头写一行 `过程文档：<路径>`，然后只输出这三块，不要加别的：",
	"",
	"1. **当前进度** —— 已做到哪一步；最近一条进展记录（时间 + 一句话）。",
	"2. **下一步** —— 文档里写的下一个具体动作；没写就写「文档没有写下一步」。",
	"3. **风险与阻塞** —— 文档里记的未完成项和坑；没有就写「没有」。",
	"",
	"如实转述文档写了什么，不要补推测；文档没写的地方标「文档未写」。",
	"",
	"## 第三步：停",
	"",
	"输出完立即停下，等用户指令。不要开始执行下一步里的动作，",
	"也不要额外提方案、不要追问。",
	"",
	"## 硬约束",
	"",
	"- 本轮只读：不写文件、不装依赖、不跑构建、不动 git，不执行 task-ledger skill 的任何写操作。",
	"- 不新建会话、不派发子 agent、不派生后台任务、不新建台账任务。",
	"- 不修改台账与过程文档；你认为该改的地方只列出来，等用户发话。",
	"- 命令报错就原样贴出，不要绕过、不要手改台账文件。",
];

const CONTINUE_EN: readonly string[] = [
	"First read the current progress of task `{{id}}` — read only, report, then stop.",
	"",
	"## Step 1: Read",
	"",
	"Look the task up with the task-ledger skill and follow the skill's own instructions;",
	"do not assemble commands yourself and do not guess script paths.",
	"",
	"Read the task fields and the working document it points to end to end — actually open the",
	"document, do not rely on the summary in the query output.",
	"",
	"If the task cannot be found, or the document cannot be read: paste the error verbatim and stop.",
	"Do not search fuzzily, do not guess the task id, do not substitute another document,",
	"and do not report it as already done.",
	"",
	"## Step 2: Report",
	"",
	"Start with one line `Process document: <path>`, then output only these three blocks:",
	"",
	"1. **Current progress** — how far it got; the latest progress entry (time + one line).",
	"2. **Next step** — the next concrete action written in the document; if none, write",
	'   "the document states no next step".',
	'3. **Risks & blockers** — unfinished items and pitfalls recorded in the document; if none, write "none".',
	"",
	"Transcribe what the document says; do not add speculation. Mark whatever the document does not",
	'state as "not stated in the document".',
	"",
	"## Step 3: Stop",
	"",
	"Stop right after reporting and wait for the user. Do not start the next step,",
	"do not propose alternatives, and do not ask follow-up questions.",
	"",
	"## Hard constraints",
	"",
	"- Read only this turn: no writing files, no installing dependencies, no builds, no git,",
	"  and no write operation of the task-ledger skill.",
	"- No new sessions, no sub-agents, no background tasks, no new ledger tasks.",
	"- Do not modify the ledger or the working document; list what you think should change and wait.",
	"- Paste command errors verbatim; do not work around them and do not hand-edit ledger files.",
];

/** 结案提示词前半段（读 + 总结 + 结），用户留言插在这一段之后。 */
const CLOSE_ZH_HEAD: readonly string[] = [
	"请按台账规范结案这个任务。任务号：`{{id}}`",
	"",
	"用户已经确认结案，**不需要你判断该不该结**。除非台账里根本查不到这个任务，否则一律结案。",
	"",
	"## 第一步：读",
	"",
	"用 task-ledger skill 查这个任务，按 skill 自己的说明走，不要另拼命令、不要猜脚本路径。",
	"",
	"把任务字段和它指向的过程文档完整读完；需要时看一眼工作区现状，弄清实际做到哪一步。",
	"查不到这个任务：把错误原样贴出来就停下。",
	"",
	"## 第二步：总结",
	"",
	"按 skill 的要求把过程文档收尾：",
	"",
	"- **最终结论**：这次到底做完了什么，写成能独立看懂的话；",
	"- **遗留项**：没做完的、留下未收尾的、已知有问题的，如实列出来，不要美化也不要略过；",
	"- **该补的补齐**：漏记的进展、状态、标签，一并补上。",
	"",
	"## 第三步：结",
	"",
	"用 task-ledger skill **正常结案**（不是取消、不是作废），结案摘要写成一句话，",
	"能直接看懂「这次做完了什么」。",
	"",
	"结完回一句「已结案」，后面带上你写的摘要原文。",
];

const CLOSE_ZH_TAIL: readonly string[] = [
	"## 硬约束",
	"",
	"- 只做结案与总结：不写业务代码、不跑构建、不装依赖、不动 git。",
	"- 结案带来的提交只应包含台账与过程文档；工作区还有别的未提交改动，就不要一并提交，说明一下就停。",
	"- 不新建会话、不派发子 agent、不新建台账任务。",
	"- 台账与过程文档只经 task-ledger skill 改，不要手改台账文件。",
	"- **不因为「还有遗留项」而拒绝结案** —— 遗留项写进结论，然后照常结。",
	"- 命令报错原样贴出，不要绕过。",
];

const CLOSE_EN_HEAD: readonly string[] = [
	"Close this task according to the ledger conventions. Task id: `{{id}}`",
	"",
	"The user has already confirmed the closure — **you do not need to judge whether it should be",
	"closed**. Unless the task cannot be found at all, close it.",
	"",
	"## Step 1: Read",
	"",
	"Look the task up with the task-ledger skill and follow the skill's own instructions;",
	"do not assemble commands yourself and do not guess script paths.",
	"",
	"Read the task fields and the working document it points to end to end; where needed, glance at",
	"the workspace to see how far it actually got. If the task cannot be found: paste the error",
	"verbatim and stop.",
	"",
	"## Step 2: Summarize",
	"",
	"Wrap up the working document the way the skill requires:",
	"",
	"- **Final conclusion**: what actually got done, written so it stands on its own;",
	"- **Leftovers**: anything unfinished, left over, or known to be broken — state it plainly,",
	"  do not polish it away and do not omit it;",
	"- **Fill in what is missing**: progress entries, status, and tags that were never recorded.",
	"",
	"## Step 3: Close",
	"",
	"Close the task **normally** with the task-ledger skill (not cancel, not void);",
	'the closing summary is one sentence a reader understands as "what got done here".',
	"",
	'After closing, reply "closed" and append the summary you wrote.',
];

const CLOSE_EN_TAIL: readonly string[] = [
	"## Hard constraints",
	"",
	"- Only closing and summarizing: no product code, no builds, no installing dependencies, no git.",
	"- The commit caused by closing should contain ledger and working documents only; if the workspace",
	"  has other uncommitted changes, do not sweep them in — say so and stop.",
	"- No new sessions, no sub-agents, no new ledger tasks.",
	"- Change the ledger and the working document only through the task-ledger skill; never hand-edit",
	"  ledger files.",
	"- **Do not refuse to close because leftovers exist** — record them in the conclusion and close anyway.",
	"- Paste command errors verbatim; do not work around them.",
];

function render(lines: readonly string[], params: Record<string, string>): string {
	return lines
		.join("\n")
		.replace(/\{\{(\w+)\}\}/gu, (_raw, key: string) => params[key] ?? "");
}

/** 「继续」的注入提示词。 */
export function continuePrompt(t: Translate, id: string): string {
	return render(isEnglish(t) ? CONTINUE_EN : CONTINUE_ZH, { id });
}

/**
 * 「完成（由 Agent 结案）」的注入提示词。
 *
 * @param note 用户留言；空串 ⇒ 整节删掉（不留「用户没有留言」这种废话）。
 */
export function closePrompt(t: Translate, id: string, note: string): string {
	const english = isEnglish(t);
	const head = render(english ? CLOSE_EN_HEAD : CLOSE_ZH_HEAD, { id });
	const tail = render(english ? CLOSE_EN_TAIL : CLOSE_ZH_TAIL, {});
	if (note === "") return `${head}\n\n${tail}`;
	const heading = english ? "## User note" : "## 用户留言";
	return `${head}\n\n${heading}\n\n${note}\n\n${tail}`;
}
