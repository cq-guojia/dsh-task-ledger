package actions

import (
	"os"
	"strings"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 取消（close --cancel）：池任务直通、结果列 cancelled、来源那行被删；别人的任务拒绝。

const (
	cancelTidPool  = "20261029-1000-池任务-aaaa"
	cancelTidMine  = "20261029-1000-我的任务-bbbb"
	cancelTidOther = "20261029-1000-别人的-cccc"
	cancelFinished = "2026-10-29 10:00:00"
	cancelOther    = "22222222-3333-4444-5555-666666666666"
)

func TestCloseCancelPoolTask(t *testing.T) {
	repo, me := tempLedger(t, map[string]any{
		"tid": cancelTidPool, "status": "open", "title": "池任务", "created": "2026-10-29 09:00:00",
	})
	res, err := CloseTask(repo, me, cancelTidPool, CloseTaskParams{Finished: cancelFinished, Cancel: true})
	if err != nil {
		t.Fatalf("取消池任务应成功：%v", err)
	}
	if res.AlreadyDone {
		t.Error("第一次取消不该是 AlreadyDone")
	}
	if _, ok, _ := store.NewTaskStore(repo, core.PoolRel, nil).Get(cancelTidPool); ok {
		t.Error("取消后公共池里不该还有这条")
	}
	raw, err := os.ReadFile(store.NewHistoryStore(repo).PathFor(cancelFinished))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "| cancelled |") {
		t.Errorf("历史行应带 cancelled：\n%s", raw)
	}
}

func TestClosePoolTaskRequiresCancel(t *testing.T) {
	repo, me := tempLedger(t, map[string]any{
		"tid": cancelTidPool, "status": "open", "title": "池任务", "created": "2026-10-29 09:00:00",
	})
	if _, err := CloseTask(repo, me, cancelTidPool, CloseTaskParams{Summary: "做完了", Finished: cancelFinished}); err == nil {
		t.Fatal("池任务直接结案应报错（要先 claim）")
	}
}

func TestCloseCancelOthersTaskRejected(t *testing.T) {
	repo, me := tempLedger(t, map[string]any{
		"tid": cancelTidOther, "status": "doing", "owner": cancelOther,
		"title": "别人的", "created": "2026-10-29 09:00:00",
	})
	if _, err := CloseTask(repo, me, cancelTidOther, CloseTaskParams{Finished: cancelFinished, Cancel: true}); err == nil {
		t.Fatal("取消别人的任务应被拒")
	}
}

func TestCloseCancelMyTaskKeepsSummary(t *testing.T) {
	repo, me := tempLedger(t, map[string]any{
		"tid": cancelTidMine, "status": "doing", "owner": testUUID,
		"owner_name": "GuoJia-Agent", "title": "我的任务", "created": "2026-10-29 09:00:00",
	})
	if _, err := CloseTask(repo, me, cancelTidMine, CloseTaskParams{Summary: "需求已被别的任务做掉", Finished: cancelFinished, Cancel: true}); err != nil {
		t.Fatalf("取消自己的任务应成功：%v", err)
	}
	if _, ok, _ := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me).Get(cancelTidMine); ok {
		t.Error("取消后分片里不该还有这条")
	}
	raw, err := os.ReadFile(store.NewHistoryStore(repo).PathFor(cancelFinished))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "| cancelled |") || !strings.Contains(string(raw), "需求已被别的任务做掉") {
		t.Errorf("历史行应带 cancelled 与备注：\n%s", raw)
	}
}
