package actions

// 查询条件长什么样。外壳把命令行装成它，界面直接构造它 —— 动作层不认识命令行参数。

// CountCap --count-only 的封顶：超过就 capped=true。
const CountCap = 10000

// 年龄阈值的内置默认（天）：停滞 / 逾期 / 积压各答一个问题，互不覆盖。
// 不传就用这三个值，传了按调用方的值算 —— 参数永远是「覆盖」，不是「必填」。
const (
	DefaultStaleDays   = 3  // 进行中：最后更新至今满这么多天没动静 = 停滞
	DefaultOverdueDays = 14 // 进行中：接任务至今满这么多天还没结案 = 逾期
	DefaultBacklogDays = 30 // 待认领：创建至今满这么多天没人接 = 积压
)

// ListQuery 在办任务的查询条件（list / stats 共用同一套：范围 + 筛选 + 年龄阈值）。
type ListQuery struct {
	Scope       string // "all" / "pool" / "mine" / "owner"
	Owner       *string
	OwnerName   *string
	Statuses    []string
	Category    *string
	Tag         *string
	Since       *string // UTC 串，闭区间；比 created
	Until       *string
	StaleDays   *int // 覆盖 DefaultStaleDays
	OverdueDays *int // 覆盖 DefaultOverdueDays
	BacklogDays *int // 覆盖 DefaultBacklogDays
}

// StaleDaysOf / OverdueDaysOf / BacklogDaysOf：没给就回内置默认（阈值永远有值可用）。
func (q ListQuery) StaleDaysOf() int   { return daysOrDefault(q.StaleDays, DefaultStaleDays) }
func (q ListQuery) OverdueDaysOf() int { return daysOrDefault(q.OverdueDays, DefaultOverdueDays) }
func (q ListQuery) BacklogDaysOf() int { return daysOrDefault(q.BacklogDays, DefaultBacklogDays) }

func daysOrDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

// HistoryQuery history 的查询条件。
type HistoryQuery struct {
	Owner     *string
	OwnerName *string
	Mine      bool
	Category  *string
	Tag       *string
	Since     *string // 比 finished
	Until     *string
	Limit     *int
	Months    *int
	CountOnly bool
}
