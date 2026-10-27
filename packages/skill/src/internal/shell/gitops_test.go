package shell

import "testing"

// isWorklogPath 的入参是相对 repo 的路径（ledger/worklog/…）。它曾直接拿这个路径
// 去比 "worklog/" 前缀，恒为 false ⇒ 「手写过程文档放行」的豁免成了死代码 ⇒
// 只要本月有一篇手写的过程文档，所有写命令都被写前 guard 硬拦。钉住两种口径。
func TestIsWorklogPath(t *testing.T) {
	cases := []struct {
		rel  string
		want bool
	}{
		{"ledger/worklog/202610/27-1330-x-8cd1.md", true}, // repo 相对：实际走这条
		{"worklog/202610/27-1330-x-8cd1.md", true},        // ledger 相对
		{"ledger/pool.json", false},
		{"ledger/owners.json", false},
		{"ledger/owners/abcdef123456.json", false},
		{"ledger/history/202610.md", false},
		{"ledger/worklog", false}, // 目录本身不算
	}
	for _, c := range cases {
		if got := isWorklogPath(c.rel); got != c.want {
			t.Errorf("isWorklogPath(%q) = %v，期望 %v", c.rel, got, c.want)
		}
	}
}
