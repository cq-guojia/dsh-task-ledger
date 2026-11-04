package shell

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 从 Main 走一遍：显式 --repo 指到父目录时，读命令必须**报业务错并列候选根**，
// 不能再静默读出一本空台账；写命令在全新空目录仍要能建出第一份台账。

func captureStderr(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stderr
	os.Stderr = w
	fn()
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stderr = old
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestMainReadCommandRejectsParentDir(t *testing.T) {
	seedLedger(t) // 身份 + 不碰 git
	parent := t.TempDir()
	child := filepath.Join(parent, "dsh-task-ledger")
	if err := os.MkdirAll(filepath.Join(child, core.LedgerDir), 0o777); err != nil {
		t.Fatal(err)
	}
	var code int
	text := captureStderr(t, func() {
		code = Main([]string{"list", "--repo", parent, "--json"})
	})
	if code != ExitBusiness {
		t.Fatalf("读命令指到父目录应退业务错，实际 %d，输出：%s", code, text)
	}
	if !strings.Contains(text, "不是台账根") || !strings.Contains(text, "dsh-task-ledger") {
		t.Errorf("报错要直说不是台账根并列出候选根，实际：%s", text)
	}
	if _, err := os.Stat(filepath.Join(parent, core.LedgerDir)); err == nil {
		t.Error("只读命令绝不能在父目录建出 ledger/")
	}
}

func TestMainWriteCommandStillCreatesFirstLedger(t *testing.T) {
	seedLedger(t) // 身份 + TASK_LEDGER_NO_SYNC=1
	fresh := t.TempDir()
	code := 0
	_ = captureStdout(t, func() {
		// seedLedger 已设 TASK_LEDGER_NO_SYNC=1，不用再传 --no-sync
		code = Main([]string{"new", "--title", "首次建台账", "--repo", fresh})
	})
	if code != ExitOK {
		t.Fatalf("全新目录首次建台账应成功，实际 %d", code)
	}
	if _, err := os.Stat(filepath.Join(fresh, core.LedgerDir)); err != nil {
		t.Fatalf("应建出 ledger/：%v", err)
	}
}

func TestMainOwnersExemptFromStrict(t *testing.T) {
	seedLedger(t)
	empty := t.TempDir() // 没台账：owners 故意回空名册，不能被严格档弄红
	code := 0
	_ = captureStdout(t, func() {
		code = Main([]string{"owners", "--repo", empty, "--json"})
	})
	if code != ExitOK {
		t.Fatalf("owners 应豁免严格档，实际 %d", code)
	}
}

func TestRepoModeOf(t *testing.T) {
	for _, command := range []string{"list", "stats", "show", "history"} {
		if got := repoModeOf(command); got != modeStrict {
			t.Errorf("%s 应走严格档，实际 %v", command, got)
		}
	}
	for _, command := range []string{"owners", "validate", "logout"} {
		if got := repoModeOf(command); got != modePlain {
			t.Errorf("%s 应豁免（沿用 AsRoot），实际 %v", command, got)
		}
	}
	for _, command := range []string{"new", "claim", "set", "log", "close", "forget"} {
		if got := repoModeOf(command); got != modeCreate {
			t.Errorf("%s 应走写档，实际 %v", command, got)
		}
	}
}

func TestMainLogoutExemptEvenWithoutLedger(t *testing.T) {
	seedLedger(t) // 身份落在临时 home，logout 删的也是它
	empty := t.TempDir()
	code := 0
	_ = captureStdout(t, func() {
		// 插件可能在清单里任取一个 anchor，那个目录的 ledger/ 已被删掉
		code = Main([]string{"logout", "--repo", empty, "--json"})
	})
	if code != ExitOK {
		t.Fatalf("logout 不碰台账，不该被根校验挡住，实际 %d", code)
	}
}
