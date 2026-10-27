package shell

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// JSON 是跨包契约（插件按它解析）：这三个新命令又是给界面喂数的，所以这里把
// 命令行从头跑一遍，钉住两件事 —— 输出必须是**合法 JSON**，且派生字段不许
// 渲染成指针地址（把 *int 直接塞进 map 的后果就是满屏 0xc000…）。

const shellTestUUID = "8d557c6d-7c93-43ac-8c73-5d623e82e1c6"

// utcAgo days 天前的存盘时间串（UTC）。
func utcAgo(days int) string {
	return time.Now().UTC().AddDate(0, 0, -days).Format("2006-01-02 15:04:05")
}

// captureStdout 跑一段会把东西打进 stdout 的代码，返回它打印的全部文本。
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w
	fn()
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stdout = old
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// seedLedger 造一个最小台账池 + 分片，并把本机身份指到一个临时主目录。
func seedLedger(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv(env.IdentityHomeEnv, home)
	t.Setenv(NoSyncEnv, "1") // 只读命令也不许碰 git
	identity := filepath.Join(home, ".taskledger", "identity.json")
	if err := store.EnsureDir(filepath.Dir(identity)); err != nil {
		t.Fatal(err)
	}
	if err := store.WriteTextAtomic(identity, "{\n  \"uuid\": \""+shellTestUUID+"\",\n  \"name\": \"测试者\"\n}\n", false); err != nil {
		t.Fatal(err)
	}

	repo := t.TempDir()
	if err := store.EnsureDir(filepath.Join(repo, core.LedgerDir, core.OwnersDir)); err != nil {
		t.Fatal(err)
	}
	me := core.Identity{UUID: shellTestUUID, Name: "测试者"}
	if _, _, err := store.NewOwnersIndex(repo).Ensure(me); err != nil {
		t.Fatal(err)
	}
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	if _, err := pool.EnsureFile(); err != nil {
		t.Fatal(err)
	}
	if err := pool.Put("20260917-0900-没人接-aaaa", map[string]any{
		"status": "open", "title": "积压的老任务", "created": utcAgo(40),
	}); err != nil {
		t.Fatal(err)
	}
	shard := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	if _, err := shard.EnsureFile(); err != nil {
		t.Fatal(err)
	}
	if err := shard.Put("20261007-0900-我的老任务-bbbb", map[string]any{
		"status": "doing", "owner": shellTestUUID, "owner_name": "测试者",
		"title": "我的老任务", "created": utcAgo(60), "started": utcAgo(20), "updated": utcAgo(5),
	}); err != nil {
		t.Fatal(err)
	}
	return repo
}

// runJSON 跑一条只读命令并断言退出码 0，返回原始输出。
func runJSON(t *testing.T, repo, command string, extra ...string) string {
	t.Helper()
	var text string
	code := 0
	text = captureStdout(t, func() {
		code = Main(append([]string{command, "--repo", repo, "--json"}, extra...))
	})
	if code != ExitOK {
		t.Fatalf("%s --json 退出码 %d（应 0），输出：%s", command, code, text)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(text), &decoded); err != nil {
		t.Fatalf("%s 的输出不是合法 JSON：%v\n%s", command, err, text)
	}
	// 派生字段必须解引用后再进 JSON：指针会渲染成 0xc000… 的地址串，
	// 嵌套 map 会渲染成 Go 的 `map[…]` 打印形态 —— 两种都不能出现
	poison := scanBadValues(decoded)
	if poison != "" {
		t.Fatalf("%s 的输出里有不合法的标量：%s\n%s", command, poison, text)
	}
	return text
}

// scanBadValues 递归找出 JSON 里任何长得像指针地址 / Go map 打印形态的字符串值。
func scanBadValues(value any) string {
	switch item := value.(type) {
	case string:
		if strings.HasPrefix(item, "map[") {
			return "Go map 的打印形态：" + item
		}
		if i := strings.Index(item, "0x"); i >= 0 && len(item)-i >= 8 {
			return "疑似指针地址：" + item
		}
		return ""
	case []any:
		for _, sub := range item {
			if bad := scanBadValues(sub); bad != "" {
				return bad
			}
		}
	case map[string]any:
		for _, sub := range item {
			if bad := scanBadValues(sub); bad != "" {
				return bad
			}
		}
	}
	return ""
}

func TestListJSONCarriesAgeFields(t *testing.T) {
	repo := seedLedger(t)
	var payload map[string]map[string]any
	text := runJSON(t, repo, "list")
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatal(err)
	}
	mine, ok := payload["20261007-0900-我的老任务-bbbb"]
	if !ok {
		t.Fatalf("没查到分片里那条：%s", text)
	}
	if mine["stale"] != true || mine["overdue"] != true {
		t.Errorf("进行 20 天、5 天没动 ⇒ stale / overdue 都应为 true，实际 %v / %v", mine["stale"], mine["overdue"])
	}
	if _, ok := mine["age_days"].(float64); !ok {
		t.Errorf("age_days 应是数字（或 null），实际 %#v", mine["age_days"])
	}
	poolTask, ok := payload["20260917-0900-没人接-aaaa"]
	if !ok {
		t.Fatalf("没查到池里那条：%s", text)
	}
	if poolTask["backlog"] != true || poolTask["waiting_days"] == nil {
		t.Errorf("创建 40 天没人接 ⇒ backlog 为 true 且 waiting_days 有值，实际 %v / %v",
			poolTask["backlog"], poolTask["waiting_days"])
	}
}

func TestStatsJSONIsContract(t *testing.T) {
	repo := seedLedger(t)
	var payload map[string]any
	text := runJSON(t, repo, "stats")
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"total", "open", "doing", "stale", "overdue", "backlog", "mine", "my_doing", "my_stale", "my_overdue", "thresholds"} {
		if _, ok := payload[key]; !ok {
			t.Errorf("stats --json 缺 %q：\n%s", key, text)
		}
	}
	thresholds, ok := payload["thresholds"].(map[string]any)
	if !ok {
		t.Fatalf("thresholds 应是对象：\n%s", text)
	}
	if thresholds["stale_days"] != float64(3) || thresholds["overdue_days"] != float64(14) || thresholds["backlog_days"] != float64(30) {
		t.Errorf("默认阈值回显不对：%v", thresholds)
	}
	if payload["total"] != float64(2) || payload["doing"] != float64(1) || payload["backlog"] != float64(1) {
		t.Errorf("计数不对：total=%v doing=%v backlog=%v", payload["total"], payload["doing"], payload["backlog"])
	}
	if _, ok := payload["oldest_open_days"].(float64); !ok {
		t.Errorf("oldest_open_days 应是数字（没待认领时是 null），实际 %#v", payload["oldest_open_days"])
	}
}

func TestStatsJSONHonorsThresholdOverride(t *testing.T) {
	repo := seedLedger(t)
	var with map[string]any
	text := runJSON(t, repo, "stats", "--stale-days", "10", "--overdue-days", "30")
	if err := json.Unmarshal([]byte(text), &with); err != nil {
		t.Fatal(err)
	}
	if with["stale"] != float64(0) || with["overdue"] != float64(0) {
		t.Errorf("阈值放宽后不该再算停滞 / 逾期：%v / %v", with["stale"], with["overdue"])
	}
	thresholds, _ := with["thresholds"].(map[string]any)
	if thresholds["stale_days"] != float64(10) || thresholds["overdue_days"] != float64(30) {
		t.Errorf("回显应是调用方给的值：%v", thresholds)
	}
}

func TestOwnersJSONLocalizesJoined(t *testing.T) {
	// joined 是存盘的 UTC：出门必须跟 list 的 created 一样转本机时区
	repo := seedLedger(t)
	const stamp = "2026-10-27 12:00:00"
	raw, ok, err := store.ReadJSONFile(filepath.Join(repo, core.ToRepoRel(core.OwnersRel)))
	if err != nil || !ok {
		t.Fatalf("读 owners.json 失败：%v", err)
	}
	workers, ok := raw["workers"].(map[string]any)
	if !ok {
		t.Fatal("owners.json 里没有 workers")
	}
	record, ok := workers[shellTestUUID].(map[string]any)
	if !ok {
		t.Fatal("workers 里没有本机那条")
	}
	record["joined"] = stamp
	if err := store.NewOwnersIndex(repo).Store.Flush(raw); err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Owners map[string]map[string]any `json:"owners"`
	}
	text := runJSON(t, repo, "owners")
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatal(err)
	}
	got := payload.Owners[shellTestUUID]["joined"]
	if got != core.FmtLocal(stamp) {
		t.Errorf("joined 应是本机时区 %q（不是存盘的 UTC %q），实际 %v", core.FmtLocal(stamp), stamp, got)
	}
}

func TestOwnersJSONIsContract(t *testing.T) {
	repo := seedLedger(t)
	var payload struct {
		Count  int                       `json:"count"`
		Owners map[string]map[string]any `json:"owners"`
	}
	text := runJSON(t, repo, "owners")
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Count != 1 || len(payload.Owners) != 1 {
		t.Fatalf("花名册应是 1 人：%s", text)
	}
	me, ok := payload.Owners[shellTestUUID]
	if !ok {
		t.Fatalf("花名册里应有本机 uuid：%s", text)
	}
	if me["mine"] != true {
		t.Errorf("本机那条 mine 应为 true，实际 %v", me["mine"])
	}
	if me["name"] != "测试者" {
		t.Errorf("名字应原样给出，实际 %v", me["name"])
	}
}

func TestRootJSONIsContract(t *testing.T) {
	repo := seedLedger(t)
	var text string
	code := 0
	text = captureStdout(t, func() { code = Main([]string{"root", "--dir", repo, "--json"}) })
	if code != ExitOK {
		t.Fatalf("root --json 退出码 %d（应 0），输出：%s", code, text)
	}
	var payload struct {
		Dir    string  `json:"dir"`
		Root   bool    `json:"root"`
		Repo   *string `json:"repo"`
		Ledger *string `json:"ledger"`
		Reason string  `json:"reason"`
	}
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatalf("root 的输出不是合法 JSON：%v\n%s", err, text)
	}
	if !payload.Root {
		t.Errorf("带了 ledger/ 的目录应是台账根：%s", text)
	}
	if payload.Repo == nil || payload.Ledger == nil {
		t.Errorf("是根时 repo / ledger 都不该是 null：%s", text)
	}
	if payload.Reason == "" {
		t.Error("reason 不能空（界面直接显示它）")
	}
}
