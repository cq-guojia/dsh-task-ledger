package core

import (
	"regexp"
	"strings"
	"testing"
)

// 工具层是纯换算，出错的表现是「时间差 8 小时」「任务号撞车」这类静默错误，
// 所以形状与拒绝面都要钉住。

func TestNormalizeTimeShapes(t *testing.T) {
	cases := []struct{ in, ref, want string }{
		{"2026-10-01", "", "2026-10-01 00:00:00"},
		{"2026-10-01", "23:59:59", "2026-10-01 23:59:59"},
		{"2026-10-01 07:30", "", "2026-10-01 07:30:00"},
		{"2026-10-01 07:30:45", "", "2026-10-01 07:30:45"},
		{"2026/10/01 07:30", "", "2026-10-01 07:30:00"},
		{"2026-10-01T07:30", "", "2026-10-01 07:30:00"},
		{"  2026-10-01   07:30 ", "", "2026-10-01 07:30:00"},
	}
	for _, c := range cases {
		got, err := NormalizeTime(c.in, "--since", "", c.ref)
		if err != nil {
			t.Errorf("%q 归一化失败：%v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("%q 归一化成 %q，期望 %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeTimeRejects(t *testing.T) {
	for _, in := range []string{"", "昨天", "2026-13-01", "2026-02-30", "2026-10-01 25:00"} {
		if _, err := NormalizeTime(in, "--since", "", ""); err == nil {
			t.Errorf("%q 应该被拒", in)
		}
	}
}

func TestToUTCThenFmtLocalRoundTrip(t *testing.T) {
	// 存盘是 UTC、显示是本地：来回一趟必须回到原来的墙钟（到分钟为止）
	wall := "2026-10-01 07:30:00"
	utc, err := ToUTC(wall, "--created", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if got := FmtLocal(utc); !strings.HasPrefix(got, "2026-10-01 07:30") {
		t.Errorf("存 %q 再显示成 %q，应回到 2026-10-01 07:30", utc, got)
	}
}

func TestMakeIDShapeAndCollision(t *testing.T) {
	shape := regexp.MustCompile(`^\d{8}-\d{4}-[a-z0-9-]+-[0-9a-f]{4}$`)
	tasks := map[string]struct{}{}
	id, err := MakeID("Fix the bug", tasks, "2026-10-27 10:00:00")
	if err != nil {
		t.Fatal(err)
	}
	if !shape.MatchString(id) {
		t.Fatalf("任务号形状不对：%q", id)
	}
	// 撞号必须换后缀，不能返回同一个
	tasks[id] = struct{}{}
	again, err := MakeID("Fix the bug", tasks, "2026-10-27 10:00:00")
	if err != nil {
		t.Fatal(err)
	}
	if again == id {
		t.Fatalf("撞号没换：%q", again)
	}
}

func TestRequireTaskIDRejects(t *testing.T) {
	if _, err := RequireTaskID(""); err == nil {
		t.Error("空任务号应该被拒")
	}
	if _, err := RequireTaskID("../../etc/passwd"); err == nil {
		t.Error("带路径穿越的任务号应该被拒")
	}
}

func TestParseTagsRules(t *testing.T) {
	if _, err := ParseTags([]string{"甲", "乙", "丙"}); err != nil {
		t.Errorf("正常标签不该报错：%v", err)
	}
	if _, err := ParseTags([]string{"1", "2", "3", "4", "5", "6"}); err == nil {
		t.Error("超过 5 个标签应该被拒")
	}
	if _, err := ParseTags([]string{""}); err == nil {
		t.Error("空标签应该被拒")
	}
}
