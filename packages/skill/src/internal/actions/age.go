package actions

import "github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"

// 年龄派生值：**只读输出，一个字节都不落盘**。
//
// 三个标记答三个不同的问题，互不覆盖（同一条可以同时中两个）：
//   - 停滞 stale：进行中，最后更新至今满 N 天没动静；
//   - 逾期 overdue：进行中，接任务至今满 N 天还没结案（中途更新不洗时钟）；
//   - 积压 backlog：待认领，创建至今满 N 天没人接。
//
// 阈值一律从 ListQuery 取：没给就用内置默认，给了就覆盖（参数永远可选）。

// AgeMarks 一条在办任务的年龄派生值。
type AgeMarks struct {
	AgeDays     *int // 进行中：started ?? created 至今（逾期看它）
	IdleDays    *int // 进行中：updated ?? started ?? created 至今（停滞看它）
	WaitingDays *int // 待认领：created 至今（积压看它）
	Stale       bool
	Overdue     bool
	Backlog     bool
}

// AgeOf 算一条任务的年龄派生值。now 是当作「现在」的存盘时间串（UTC）。
//
// 旧数据里的 blocked 一律当进行中（与状态机一致：现在只有 open / doing 两种在办值）。
func AgeOf(task map[string]any, now string, q ListQuery) AgeMarks {
	status := statusOf(task)
	marks := AgeMarks{}
	switch status {
	case "doing", "blocked":
		marks.AgeDays = core.DaysSince(firstStamp(task, "started", "created"), now)
		marks.IdleDays = core.DaysSince(firstStamp(task, "updated", "started", "created"), now)
		marks.Stale = marks.IdleDays != nil && *marks.IdleDays >= q.StaleDaysOf()
		marks.Overdue = marks.AgeDays != nil && *marks.AgeDays >= q.OverdueDaysOf()
	default:
		// 其余（open，以及手工改坏台账冒出来的未知状态）一律按「没人认领」算等待天数 ——
		// 与 stats 的 open 计数同一个判据：非进行中就是待认领，不许两边口径分叉
		marks.WaitingDays = core.DaysSince(firstStamp(task, "created"), now)
		marks.Backlog = marks.WaitingDays != nil && *marks.WaitingDays >= q.BacklogDaysOf()
	}
	return marks
}

// ApplyAge 把派生值写进任务字典 —— 键名是 `--json` 的契约，改键名按破坏性变更对待。
// 取不到时间时天数字段给 null（不编造 0），三个标记恒为布尔（缺时间 ⇒ 不满足阈值）。
func ApplyAge(task map[string]any, now string, q ListQuery) {
	marks := AgeOf(task, now, q)
	task["age_days"] = intOrNil(marks.AgeDays)
	task["idle_days"] = intOrNil(marks.IdleDays)
	task["waiting_days"] = intOrNil(marks.WaitingDays)
	task["stale"] = marks.Stale
	task["overdue"] = marks.Overdue
	task["backlog"] = marks.Backlog
}

// firstStamp 取第一个非空的时间字段：老数据缺 updated / started 时按这个顺序回退。
func firstStamp(task map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strOfAny(task[key]); value != "" {
			return value
		}
	}
	return ""
}

// intOrNil 天数进 JSON：有值给整数，没有给 null（**不能给指针** —— 输出层不认指针）。
// 与 shell.intOrNull 是同一件事在两个包各一份，改这里也改那边。
func intOrNil(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

// boolOf / intOf 读回 ApplyAge 写进去的派生值（拿不到按「没有」算，不猜）。
func boolOf(v any) bool {
	value, _ := v.(bool)
	return value
}

func intOf(v any) *int {
	if value, ok := v.(int); ok {
		return &value
	}
	return nil
}
