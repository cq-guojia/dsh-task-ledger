package core

import "testing"

// 历史行按任务号定位的判据：只从 worklog/ 段往后比「月份目录 + 过程文档名」，
// 前面的层级（../、多级归档目录）与 Windows 分隔符都不影响。
func TestWorklogMatchesTask(t *testing.T) {
	tid := "20261101-1017-ebed-台账目录清单与隐藏开关"
	cases := []struct {
		name, worklog, tid string
		want               bool
	}{
		{"标准相对路径", "../worklog/202611/01-1017-ebed-台账目录清单与隐藏开关.md", tid, true},
		{"多层级前缀", "../../archive/team/worklog/202611/01-1017-ebed-台账目录清单与隐藏开关.md", tid, true},
		{"仅文件名", "worklog/202611/01-1017-ebed-台账目录清单与隐藏开关.md", tid, true},
		{"Windows 分隔符", `..\worklog\202611\01-1017-ebed-台账目录清单与隐藏开关.md`, tid, true},
		{"月份不匹配", "../worklog/202612/01-1017-ebed-台账目录清单与隐藏开关.md", tid, false},
		{"随机码不匹配", "../worklog/202611/01-1017-abcd-台账目录清单与隐藏开关.md", tid, false},
		{"空 worklog", "", tid, false},
		{"短任务号", "../worklog/202611/01-1017-ebed-x.md", "20261101", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := WorklogMatchesTask(tc.worklog, tc.tid); got != tc.want {
				t.Fatalf("WorklogMatchesTask(%q, %q) = %v, want %v", tc.worklog, tc.tid, got, tc.want)
			}
		})
	}
}
