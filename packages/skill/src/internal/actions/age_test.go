package actions

import (
	"testing"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 三个年龄标记是插件侧不再自己算的前提：判错一个，界面上的风险标记就全错，
// 而它们**不落盘**（纯派生），只能在测试里钉。

func ago(days int) string {
	return time.Now().UTC().AddDate(0, 0, -days).Format("2006-01-02 15:04:05")
}

func taskWith(status string, fields map[string]any) map[string]any {
	task := map[string]any{"status": status}
	for k, v := range fields {
		task[k] = v
	}
	return task
}

func TestAgeOfBacklogOpenTask(t *testing.T) {
	marks := AgeOf(taskWith("open", map[string]any{"created": ago(40)}), core.Now(), ListQuery{})
	if marks.WaitingDays == nil || *marks.WaitingDays != 40 {
		t.Fatalf("待认领应已等 40 天，实际 %v", marks.WaitingDays)
	}
	if !marks.Backlog {
		t.Error("创建 40 天没人接 ⇒ 积压（默认阈值 30 天）")
	}
	if marks.Stale || marks.Overdue || marks.AgeDays != nil || marks.IdleDays != nil {
		t.Error("待认领不该有停滞 / 逾期 / 进行天数 / 停滞天数")
	}
}

func TestAgeOfWorkingTaskStaleAndOverdue(t *testing.T) {
	// 20 天前接的任务、5 天前最后动过：逾期（≥14）与停滞（≥3）同时成立
	task := taskWith("doing", map[string]any{
		"created": ago(60), "started": ago(20), "updated": ago(5),
	})
	marks := AgeOf(task, core.Now(), ListQuery{})
	if marks.AgeDays == nil || *marks.AgeDays != 20 {
		t.Errorf("进行天数是 %v，期望 20", marks.AgeDays)
	}
	if marks.IdleDays == nil || *marks.IdleDays != 5 {
		t.Errorf("停滞天数是 %v，期望 5", marks.IdleDays)
	}
	if !marks.Overdue || !marks.Stale {
		t.Errorf("应同时逾期与停滞，实际 overdue=%v stale=%v", marks.Overdue, marks.Stale)
	}
	if marks.Backlog {
		t.Error("进行中的任务不是积压")
	}
}

func TestAgeOfBlockedCountsAsWorking(t *testing.T) {
	// 旧数据里的 blocked 一律按进行中判年龄
	recent := taskWith("blocked", map[string]any{"created": ago(9), "started": ago(9)})
	if marks := AgeOf(recent, core.Now(), ListQuery{}); marks.Overdue || marks.Backlog {
		t.Error("blocked 应按进行中判年龄（9 天没到逾期阈值）")
	} else if marks.AgeDays == nil {
		t.Error("blocked 也该算出进行天数")
	}
	older := taskWith("blocked", map[string]any{"created": ago(20), "started": ago(20)})
	if marks := AgeOf(older, core.Now(), ListQuery{}); !marks.Overdue {
		t.Error("blocked 且进行 20 天 ⇒ 应判逾期")
	}
}

func TestAgeOfUnknownStatusCountsAsWaiting(t *testing.T) {
	// 手工改坏台账冒出来的未知状态：非进行中 ⇒ 按待认领算等待天数，
	// 与 stats 的 open 计数同一个判据（两边口径不许分叉）
	marks := AgeOf(taskWith("weird", map[string]any{"created": ago(40)}), core.Now(), ListQuery{})
	if marks.WaitingDays == nil || *marks.WaitingDays != 40 {
		t.Fatalf("未知状态应算出等待天数 40，实际 %v", marks.WaitingDays)
	}
	if !marks.Backlog {
		t.Error("未知状态且创建 40 天 ⇒ 积压")
	}
}

func TestAgeThresholdOverride(t *testing.T) {
	task := taskWith("doing", map[string]any{"created": ago(20), "started": ago(20), "updated": ago(5)})
	now := core.Now()
	if marks := AgeOf(task, now, ListQuery{StaleDays: intPtr(10)}); marks.Stale {
		t.Error("停滞阈值改成 10 天后，停滞 5 天的不该再算停滞")
	}
	if marks := AgeOf(task, now, ListQuery{OverdueDays: intPtr(30)}); marks.Overdue {
		t.Error("逾期阈值改成 30 天后，进行 20 天的不该再算逾期")
	}
	if marks := AgeOf(task, now, ListQuery{}); !marks.Stale || !marks.Overdue {
		t.Error("不传阈值应回内置默认（停滞 3 / 逾期 14）")
	}
}

func TestAgeOfMissingStampsGivesNull(t *testing.T) {
	marks := AgeOf(taskWith("doing", nil), core.Now(), ListQuery{})
	if marks.AgeDays != nil || marks.IdleDays != nil || marks.Stale || marks.Overdue {
		t.Errorf("没有时间字段 ⇒ 天数为 nil、标记全 false，实际 %+v", marks)
	}
}

func TestAgeFutureStampsClampToZero(t *testing.T) {
	future := time.Now().UTC().AddDate(0, 0, 3).Format("2006-01-02 15:04:05")
	marks := AgeOf(taskWith("open", map[string]any{"created": future}), core.Now(), ListQuery{})
	if marks.WaitingDays == nil || *marks.WaitingDays != 0 {
		t.Errorf("未来的创建时间应记 0 天（不记负数），实际 %v", marks.WaitingDays)
	}
	if marks.Backlog {
		t.Error("0 天不该判积压")
	}
}

func TestApplyAgeKeysAreContract(t *testing.T) {
	task := taskWith("open", map[string]any{"created": ago(3)})
	ApplyAge(task, core.Now(), ListQuery{})
	for _, key := range []string{"age_days", "idle_days", "waiting_days", "stale", "overdue", "backlog"} {
		if _, ok := task[key]; !ok {
			t.Errorf("派生键 %q 没写进任务字典（改键名 = 破坏性变更）", key)
		}
	}
	if _, ok := task["waiting_days"].(*int); ok {
		t.Error("天数字段不许放指针 —— 输出层不认指针，会渲染成地址")
	}
}

func intPtr(n int) *int { return &n }
