package shell

import (
	"errors"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"testing"
)

// 命令行解析：这层最容易「静默接受一个本不该接受的参数」，所以逐条钉住。

func parse(t *testing.T, argv ...string) *Args {
	t.Helper()
	a, err := ParseArgs(argv)
	if err != nil {
		t.Fatalf("解析 %v 失败：%v", argv, err)
	}
	return a
}

func TestHelpExitsClean(t *testing.T) {
	for _, argv := range [][]string{{"-h"}, {"--help"}, {"list", "--help"}, {"new", "-h"}} {
		_, err := ParseArgs(argv)
		var hr *helpRequest
		if !errors.As(err, &hr) {
			t.Fatalf("%v 应该是「看帮助」，实际 %v", argv, err)
		}
		want := ""
		if len(argv) == 2 {
			want = argv[0]
		}
		if hr.command != want {
			t.Errorf("%v 的帮助命令是 %q，期望 %q", argv, hr.command, want)
		}
	}
}

func TestHelpDocExists(t *testing.T) {
	// 每个子命令都必须有 --help 文案：文档教人「看 --help」，这里不能空
	for command := range commandFlags {
		doc, ok := commandHelp[command]
		if !ok || doc.usage == "" || len(doc.options) == 0 {
			t.Errorf("%s 没有 --help 文案", command)
		}
	}
}

func TestNoCommandIsUsageError(t *testing.T) {
	if _, err := ParseArgs(nil); err == nil {
		t.Fatal("无参数应该是用法错")
	}
}

func TestUnknownCommand(t *testing.T) {
	if _, err := ParseArgs([]string{"nosuch"}); err == nil {
		t.Fatal("未知命令应该报错")
	}
}

func TestFlagOrdersAndRepo(t *testing.T) {
	// --repo 命令名前后来都认
	before := parse(t, "--repo", "/r", "list")
	after := parse(t, "list", "--repo", "/r")
	if before.Repo != "/r" || after.Repo != "/r" {
		t.Fatalf("--repo 解析不对：%q / %q", before.Repo, after.Repo)
	}
	// --no-sync 只在顶层
	if !parse(t, "--no-sync", "list").NoSync {
		t.Fatal("顶层 --no-sync 没生效")
	}
	if _, err := ParseArgs([]string{"list", "--no-sync"}); err == nil {
		t.Fatal("子命令后的 --no-sync 应该报错（它挂顶层）")
	}
}

func TestAbbreviation(t *testing.T) {
	// argparse allow_abbrev：唯一前缀匹配；精确同名优先；多义要报错
	if a := parse(t, "list", "--owner-n", "Guo"); a.OwnerName == nil || *a.OwnerName != "Guo" {
		t.Fatalf("--owner-n 应匹配 --owner-name，实际 %v", a.OwnerName)
	}
	if a := parse(t, "list", "--owner", "u"); a.Owner == nil || *a.Owner != "u" {
		t.Fatal("--owner 应精确匹配自己，不该被 --owner-name 抢")
	}
	_, err := ParseArgs([]string{"list", "--own", "x"})
	if err == nil || !strings.Contains(err.Error(), "歧义") {
		t.Fatalf("--own 有歧义应报错，实际 %v", err)
	}
}

func TestRequiredFlags(t *testing.T) {
	cases := [][]string{
		{"new"},
		{"claim"},
		{"log", "--id", "x"},
		{"close", "--id", "x"},
		{"show"},
	}
	for _, argv := range cases {
		if _, err := ParseArgs(argv); err == nil {
			t.Errorf("%v 缺必填项应该报错", argv)
		}
	}
}

func TestBoolFlagRejectsValue(t *testing.T) {
	if _, err := ParseArgs([]string{"list", "--json=1"}); err == nil {
		t.Fatal("--json=1 应该报错（布尔参数不接受取值）")
	}
}

func TestTagsSplitting(t *testing.T) {
	// 顿号 / 中文逗号 / 半角逗号都要切，空格丢掉
	a := parse(t, "new", "--title", "t", "--tags", "甲、乙，丙, 丁")
	want := []string{"甲", "乙", "丙", "丁"}
	if len(a.Tags) != len(want) {
		t.Fatalf("标签切出来 %v，期望 %v", a.Tags, want)
	}
	for i, tag := range want {
		if a.Tags[i] != tag {
			t.Fatalf("标签切出来 %v，期望 %v", a.Tags, want)
		}
	}
}

func TestOwnerEmptyIsNotDropped(t *testing.T) {
	// `--owner ""` 是「给了个空串」⇒ 业务层报「只收 uuid」；
	// 这里顺手钉住，免得哪天又被 nonEmptyPtr 吞掉。
	a := parse(t, "list", "--owner", "")
	if a.Owner == nil || *a.Owner != "" {
		t.Fatalf("空 owner 应该原样保留，实际 %v", a.Owner)
	}
}

func TestListScopePrecedence(t *testing.T) {
	// mine → pool → owner；空 owner 不算范围
	cases := []struct {
		argv  []string
		scope string
	}{
		{[]string{"list"}, "all"},
		{[]string{"list", "--mine"}, "mine"},
		{[]string{"list", "--pool"}, "pool"},
		{[]string{"list", "--owner", "u"}, "owner"},
		{[]string{"list", "--owner", ""}, "all"},
		{[]string{"list", "--mine", "--pool"}, "mine"},
		{[]string{"list", "--pool", "--owner", "u"}, "pool"},
	}
	for _, c := range cases {
		a := parse(t, c.argv...)
		if err := buildQuery(a); err != nil {
			t.Fatalf("%v 构建查询失败：%v", c.argv, err)
		}
		if a.Query.Scope != c.scope {
			t.Errorf("%v 的范围是 %q，期望 %q", c.argv, a.Query.Scope, c.scope)
		}
	}
}

func TestJSONCountOnlyMutuallyExclusive(t *testing.T) {
	if code := Main([]string{"history", "--json", "--count-only"}); code != ExitUsage {
		t.Fatalf("--json 与 --count-only 同时给应是用法错（2），实际 %d", code)
	}
}

func TestSinceUntilDateOnly(t *testing.T) {
	// 只给日期：下限顶 00:00:00、上限顶 23:59:59（再由 ToUTC 换算成本机时区）
	a := parse(t, "list", "--since", "2026-10-01", "--until", "2026-10-31")
	if err := buildQuery(a); err != nil {
		t.Fatal(err)
	}
	wantSince, err := core.ToUTC("2026-10-01", "--since", "", "")
	if err != nil {
		t.Fatal(err)
	}
	wantUntil, err := core.ToUTC("2026-10-31", "--until", "", "23:59:59")
	if err != nil {
		t.Fatal(err)
	}
	if a.Query.Since == nil || *a.Query.Since != wantSince {
		t.Errorf("--since 是 %v，期望 %q", a.Query.Since, wantSince)
	}
	if a.Query.Until == nil || *a.Query.Until != wantUntil {
		t.Errorf("--until 是 %v，期望 %q", a.Query.Until, wantUntil)
	}
}
