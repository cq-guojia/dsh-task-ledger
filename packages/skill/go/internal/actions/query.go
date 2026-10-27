package actions

// 查询条件长什么样。外壳把命令行装成它，界面直接构造它 —— 动作层不认识命令行参数。

// CountCap --count-only 的封顶：超过就 capped=true。
const CountCap = 10000

// ListQuery list 的查询条件。
type ListQuery struct {
	Scope     string // "all" / "pool" / "mine" / "owner"
	Owner     *string
	OwnerName *string
	Statuses  []string
	Category  *string
	Tag       *string
	Since     *string // UTC 串，闭区间；比 created
	Until     *string
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

func strOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
