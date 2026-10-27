// Package shell 是对外接口层：解析命令行、打印输出、跑 git。
package shell

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/actions"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/jsonfmt"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/notices"
)

// 唯一打印处。一个返回类型一个函数，不做统一分发；也不 flush。
// FlushNotices 只在 Main 的 defer 里调一次 —— 提交 / 推送阶段冒出来的提示也才打得到。

func out(text string) { os.Stdout.WriteString(text + "\n") }

func errOut(text string) { os.Stderr.WriteString(text + "\n") }

// FlushNotices 把 notices 一次性打到 stderr（退出前调一次，同一句只打一次）。
func FlushNotices() {
	for _, line := range notices.Warnings() {
		errOut(line)
	}
	notices.Clear()
}

// FailMessage 业务错误 / 未预期错误的 stderr 输出。
func FailMessage(title, message string) {
	errOut(title + "：" + message)
}

// RepoBanner 只读命令开头自报「读的是哪个台账」（输出是 JSON 时不打）。
func RepoBanner(repo string, machine bool) {
	if !machine {
		out("台账：" + repo)
	}
}

func jsonOut(data any) { os.Stdout.WriteString(jsonfmt.Marshal(data) + "\n") }

// TimeFields 存盘 UTC、出门要转本机时区的时间字段（任务 / 历史行 / 名册里的记录）。
var TimeFields = []string{"created", "started", "updated", "finished", "joined"}

// LocalizeTimes 复制一份，把四个时间字段转成本机时区；其余字段原样。
func LocalizeTimes(data map[string]any) map[string]any {
	outMap := make(map[string]any, len(data))
	for k, v := range data {
		outMap[k] = v
	}
	for _, key := range TimeFields {
		if value, ok := outMap[key].(string); ok && value != "" {
			outMap[key] = core.FmtLocal(value)
		}
	}
	return outMap
}

// padRight 按**字符数**右填充，中文算一个字。
func padRight(text string, width int) string {
	n := len([]rune(text))
	if n >= width {
		return text
	}
	return text + strings.Repeat(" ", width-n)
}

// RenderResult 写动作：一律人话（--json 不挂写动作）。
func RenderResult(res *actions.Result) {
	if res.AlreadyDone {
		out("无需重复：这次没有新的改动。")
	} else {
		changed := "（无字段改动）"
		if len(res.Changed) > 0 {
			changed = strings.Join(res.Changed, "、")
		}
		out("已改：" + changed)
	}
	if res.Where != nil {
		out("落点：" + *res.Where)
	}
	for _, line := range res.Notices {
		errOut(line)
	}
	if res.Worklog != nil {
		if res.Worklog.Path != nil {
			out("过程文档：" + *res.Worklog.Path)
		} else if res.Worklog.Error != nil {
			errOut("过程文档：" + *res.Worklog.Error)
		}
	}
}

// RenderList list 的输出。
func RenderList(res *actions.ListResult, asJSON bool) {
	if asJSON {
		payload := make(map[string]any, len(res.Rows))
		for tid, task := range res.Rows {
			payload[tid] = LocalizeTimes(task)
		}
		jsonOut(payload)
		return
	}
	if len(res.Table) == 0 {
		out("没有符合条件的在办任务。")
		return
	}
	out(fmt.Sprintf("在办 %d 条：", len(res.Table)))
	for _, row := range res.Table {
		owner := "（未认领）"
		if row.Owner != nil {
			owner = *row.Owner
		}
		out("  " + row.Tid + "  " + padRight(row.Status, 6) + " " + padRight(owner, 12) + " " + row.Title + ageMark(row))
	}
	for _, line := range res.Notices {
		errOut(line)
	}
}

// ageMark 人话表格里三个年龄标记的后缀（可叠加：一条能同时中两个）。
// 只是把 JSON 里那三个布尔露出来，判定在 actions 层，这里不重算。
func ageMark(row actions.TaskRow) string {
	var marks []string
	if row.Stale {
		marks = append(marks, "停滞")
	}
	if row.Overdue {
		marks = append(marks, "逾期")
	}
	if row.Backlog {
		marks = append(marks, "积压")
	}
	if len(marks) == 0 {
		return ""
	}
	return "  [" + strings.Join(marks, "、") + "]"
}

// RenderStats stats 的输出。
func RenderStats(res *actions.StatsResult, asJSON bool) {
	if asJSON {
		jsonOut(map[string]any{
			"total":            res.Total,
			"open":             res.Open,
			"doing":            res.Doing,
			"stale":            res.Stale,
			"overdue":          res.Overdue,
			"backlog":          res.Backlog,
			"mine":             res.Mine,
			"my_doing":         res.MyDoing,
			"my_stale":         res.MyStale,
			"my_overdue":       res.MyOverdue,
			"oldest_open_days": intOrNull(res.OldestOpenDays),
			"thresholds":       res.Thresholds,
		})
		return
	}
	out(fmt.Sprintf("在办 %d 条：待认领 %d、进行中 %d", res.Total, res.Open, res.Doing))
	out(fmt.Sprintf("停滞 %d（我的 %d）　逾期 %d（我的 %d）　积压 %d",
		res.Stale, res.MyStale, res.Overdue, res.MyOverdue, res.Backlog))
	if res.OldestOpenDays != nil {
		out(fmt.Sprintf("最老的待认领已等 %d 天", *res.OldestOpenDays))
	}
	out(fmt.Sprintf("阈值：停滞 %v 天 / 逾期 %v 天 / 积压 %v 天",
		res.Thresholds["stale_days"], res.Thresholds["overdue_days"], res.Thresholds["backlog_days"]))
	for _, line := range res.Notices {
		errOut(line)
	}
}

// RenderOwners owners 的输出。
func RenderOwners(res *actions.OwnersResult, asJSON bool) {
	// 遍历顺序定死：按 name（没名字的排最后）再按 uuid —— Go map 的迭代序是随机的，
	// 同一个人名单两次跑出两种顺序会让人以为花名册变了。
	keys := make([]string, 0, len(res.Owners))
	for uuid := range res.Owners {
		keys = append(keys, uuid)
	}
	sort.Slice(keys, func(i, j int) bool {
		nameA := strOf(res.Owners[keys[i]]["name"])
		nameB := strOf(res.Owners[keys[j]]["name"])
		if nameA == "" {
			nameA = "\uffff"
		}
		if nameB == "" {
			nameB = "\uffff"
		}
		if nameA != nameB {
			return nameA < nameB
		}
		return keys[i] < keys[j]
	})
	if asJSON {
		// 必须转成 map[string]any：输出层只认这一种字典，原样塞嵌套 map 会被当成字符串整体打印
		owners := make(map[string]any, len(res.Owners))
		for _, uuid := range keys {
			// joined 是存盘的 UTC，出门也要跟 list 的 created 一样转本机时区
			owners[uuid] = LocalizeTimes(res.Owners[uuid])
		}
		jsonOut(map[string]any{"count": res.Count, "owners": owners})
		return
	}
	if res.Count == 0 {
		out("花名册是空的：这个工作区还没有人登记。")
		return
	}
	out(fmt.Sprintf("花名册 %d 人：", res.Count))
	for _, uuid := range keys {
		name := strOf(res.Owners[uuid]["name"])
		if name == "" {
			name = "（没名字）"
		}
		mine := ""
		if boolOfAny(res.Owners[uuid]["mine"]) {
			mine = "  ← 本机"
		}
		out("  " + padRight("@"+name, 16) + uuid + mine)
	}
	for _, line := range res.Notices {
		errOut(line)
	}
}

// RenderRoot root（台账根检测）的输出。
func RenderRoot(res *actions.RootResult, asJSON bool) {
	if asJSON {
		jsonOut(map[string]any{
			"dir":    res.Dir,
			"root":   res.Root,
			"repo":   strPtr(res.Repo),
			"ledger": strPtr(res.Ledger),
			"reason": res.Reason,
		})
		return
	}
	if res.Root {
		out("是台账根：" + res.Dir)
		out("  台账目录：" + strValue(res.Ledger))
		return
	}
	out("不是台账根：" + res.Dir)
	if repo := strValue(res.Repo); repo != "" {
		out("  往上找到的工作区根：" + repo)
	}
	out("  " + res.Reason)
}

// intOrNull *int → JSON 值（与 actions.intOrNil 同一件事：两处的调用方不同包，改一处记得改另一处）。
func intOrNull(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func boolOfAny(v any) bool {
	value, _ := v.(bool)
	return value
}

func strPtr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func strValue(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// RenderWhoami 本机身份：未初始化给 uuid / name 双 null（不是错误）。
func RenderWhoami(identity *core.Identity, asJSON bool) {
	if asJSON {
		var uuidValue, nameValue any
		if identity != nil {
			uuidValue = identity.UUID
			if identity.Name != "" {
				nameValue = identity.Name
			}
		}
		jsonOut(map[string]any{"uuid": uuidValue, "name": nameValue})
		return
	}
	if identity == nil {
		out("这台机器还没有初始化身份。")
		out("  处理：请用户在自己的终端运行 `progress init --repo <工作区根>`，由 ta 亲自选择/新建并确认。")
		return
	}
	out("@" + identity.Label() + "   " + identity.UUID)
}

// RenderShow show 的输出。
func RenderShow(res *actions.ShowResult, asJSON bool) {
	if asJSON {
		var pathValue, textValue, errorValue any
		if res.Worklog != nil {
			if res.Worklog.Path != nil {
				pathValue = *res.Worklog.Path
			}
			if res.Worklog.Text != nil {
				textValue = *res.Worklog.Text
			}
			if res.Worklog.Error != nil {
				errorValue = *res.Worklog.Error
			}
		}
		jsonOut(map[string]any{
			"task":   LocalizeTimes(res.Task),
			"legacy": res.Legacy,
			"worklog": map[string]any{
				"path":  pathValue,
				"text":  textValue,
				"error": errorValue,
			},
			"others": res.Others,
		})
		return
	}
	title := strOf(res.Task["title"])
	out(strOf(res.Task["tid"]) + "：" + title)
	owner := strOf(res.Task["owner_name"])
	if owner == "" {
		owner = strOf(res.Task["owner"])
	}
	if owner == "" {
		owner = "（未认领）"
	}
	out("  状态：" + strOf(res.Task["status"]) + "　负责人：" + owner)
	out("  创建：" + core.FmtLocal(strOf(res.Task["created"])) + "　最后更新：" + core.FmtLocal(strOf(res.Task["updated"])))
	if len(res.Others) > 0 {
		out("  还出现在：" + strings.Join(res.Others, "、"))
	}
	if res.Worklog == nil {
		return
	}
	if res.Worklog.Error != nil {
		errOut("  过程文档：" + *res.Worklog.Error)
	} else if res.Worklog.Path != nil {
		out("  过程文档：" + *res.Worklog.Path)
	}
}

// RenderHistory history 的输出。
func RenderHistory(res *actions.HistoryResult, q *actions.HistoryQuery, asJSON bool) {
	// --count-only 是计数口径：固定两个键的 JSON，与 --json 互斥
	if q != nil && q.CountOnly {
		jsonOut(map[string]any{"count": res.Count, "capped": res.Capped})
		return
	}
	if asJSON {
		filters := make(map[string]any, len(res.Filters))
		for k, v := range res.Filters {
			filters[k] = v
		}
		for _, key := range []string{"since", "until"} {
			if value, ok := filters[key].(string); ok && value != "" {
				filters[key] = core.FmtLocal(value)
			}
		}
		records := make([]map[string]any, 0, len(res.Records))
		for _, row := range res.Records {
			records = append(records, LocalizeTimes(row))
		}
		jsonOut(map[string]any{
			"count":    res.Count,
			"filters":  filters,
			"records":  records,
			"warnings": res.Warnings,
			"capped":   res.Capped,
		})
		return
	}
	for _, line := range res.Warnings {
		errOut("警告：" + line)
	}
	if len(res.Records) == 0 {
		out("没有符合条件的结案记录。")
		return
	}
	out(fmt.Sprintf("已结案 %d 条：", res.Count))
	for _, row := range res.Records {
		owner := strOf(row["owner_name"])
		if owner == "" {
			owner = strOf(row["owner"])
		}
		if owner == "" {
			owner = "（无人）"
		}
		out("  " + core.FmtLocal(strOf(row["finished"])) + "  " + padRight(owner, 12) + " " + strOf(row["title"]))
	}
}

// RenderValidate validate 的输出。
func RenderValidate(rep *actions.ValidationReport, asJSON bool) {
	if asJSON {
		problems := rep.Problems
		if problems == nil {
			problems = []string{}
		}
		notices := rep.Notices
		if notices == nil {
			notices = []string{}
		}
		jsonOut(map[string]any{
			"problems":      problems,
			"notices":       notices,
			"checked_files": rep.CheckedFiles,
			"total_tasks":   rep.TotalTasks,
			"deep":          rep.Deep,
		})
		return
	}
	mode := "浅度"
	if rep.Deep {
		mode = "深度"
	}
	out(fmt.Sprintf("体检（%s）：查了 %d 个文件、%d 条任务。", mode, rep.CheckedFiles, rep.TotalTasks))
	if len(rep.Problems) > 0 {
		out(fmt.Sprintf("问题 %d 条：", len(rep.Problems)))
		for _, line := range rep.Problems {
			out("  - " + line)
		}
	} else {
		out("没有问题。")
	}
	for _, line := range rep.Notices {
		errOut("提示：" + line)
	}
}

func strOf(v any) string {
	s, _ := v.(string)
	return s
}
