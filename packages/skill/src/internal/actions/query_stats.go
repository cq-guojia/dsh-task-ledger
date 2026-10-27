package actions

import "github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"

// 只读：在办任务的统计（按状态 + 年龄阈值数出各面）。**独立于 list** ——
// 只数数、不吐行：界面要「一行一个任务」走 list，要「各面多少个」走这里。
//
// 筛选条件与 list 完全同一套（共用 selectTasks：范围 / 状态 / 分类 / 标签 / 创建时间），
// 阈值不传用内置默认、传了覆盖。范围只作用活跃任务（池 open + 分片 doing），历史不动。

func StatsTasks(repo string, me core.Identity, q ListQuery) (*StatsResult, error) {
	now := core.Now()
	kept, _, err := selectTasks(repo, me, q, now)
	if err != nil {
		return nil, err
	}
	res := &StatsResult{
		Thresholds: map[string]any{
			"stale_days":   q.StaleDaysOf(),
			"overdue_days": q.OverdueDaysOf(),
			"backlog_days": q.BacklogDaysOf(),
		},
	}
	var oldest *int
	for _, task := range kept {
		res.Total++
		working := isWorking(task)
		if working {
			res.Doing++
		} else {
			res.Open++
			if days := intOf(task["waiting_days"]); days != nil && (oldest == nil || *days > *oldest) {
				oldest = days
			}
		}
		if boolOf(task["stale"]) {
			res.Stale++
		}
		if boolOf(task["overdue"]) {
			res.Overdue++
		}
		if boolOf(task["backlog"]) {
			res.Backlog++
		}
		if boolOf(task["mine"]) {
			res.Mine++
			if working {
				res.MyDoing++
			}
			if boolOf(task["stale"]) {
				res.MyStale++
			}
			if boolOf(task["overdue"]) {
				res.MyOverdue++
			}
		}
	}
	res.OldestOpenDays = oldest
	return res, nil
}

// isWorking 这条在不在进行中（旧数据的 blocked 一律当进行中）。
func isWorking(task map[string]any) bool {
	switch statusOf(task) {
	case "doing", "blocked":
		return true
	}
	return false
}
