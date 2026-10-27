// Package env 确定「我是谁」的唯一地方：只读机器级身份文件，不读 git、不读环境变量。
// 身份文件：$TASK_LEDGER_HOME/.taskledger/identity.json（默认 ~/.taskledger/identity.json）。
package env

import (
	"os"
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// IdentityHomeEnv 可覆写主目录（容器 / 测试用）。
const IdentityHomeEnv = "TASK_LEDGER_HOME"

// IdentityFile 机器级身份文件路径。
func IdentityFile() (string, error) {
	if base := os.Getenv(IdentityHomeEnv); base != "" {
		return filepath.Join(base, ".taskledger", "identity.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "", core.Failf("找不到用户主目录（HOME）。\n  处理：设置环境变量 TASK_LEDGER_HOME 指向一个可写目录，再重试。")
	}
	return filepath.Join(home, ".taskledger", "identity.json"), nil
}

// ReadIdentity 读机器身份；文件不存在、空文件、坏 JSON、没 uuid 一律 (Identity{}, false)。
func ReadIdentity() (core.Identity, bool, error) {
	path, err := IdentityFile()
	if err != nil {
		return core.Identity{}, false, err
	}
	data, ok, err := store.ReadJSONFile(path)
	if err != nil || !ok {
		return core.Identity{}, false, nil
	}
	uuid, _ := data["uuid"].(string)
	uuid = core.Normalize(uuid)
	if uuid == "" {
		return core.Identity{}, false, nil
	}
	if !core.LooksLikeUUID(uuid) {
		return core.Identity{}, false, core.Failf("身份文件里的 uuid 不合法：%s\n  读到：%s（身份键只能是 uuid，不能是邮箱 / 名字）\n  处理：把该文件的 uuid 改成 uuid（或删掉这个文件重跑 init）。", path, uuid)
	}
	name, _ := data["name"].(string)
	return core.Identity{UUID: uuid, Name: trimSpace(name)}, true, nil
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

// Current 当前操作者；没初始化就报错，提示去 init。
// name 的取值规则：工作区 owners.json 里同 uuid 的 name 优先，没有就用总体的 name。
func Current(repo string) (core.Identity, error) {
	identity, ok, err := ReadIdentity()
	if err != nil {
		return core.Identity{}, err
	}
	if !ok {
		return core.Identity{}, core.Failf("这台机器还没有初始化身份。\n  处理：这是未初始化，不是故障——不要 ls / cat identity.json / 读源码或台账去排查。\n  请让用户在自己的终端运行 `progress init --repo <工作区根>`，由 ta 亲自选择/新建并确认；\n  Agent 只能裸跑 init 只读把名册报给 ta。细则见 references/init-identity.md。")
	}
	if repo != "" {
		if name, err := workspaceName(repo, identity.UUID); err == nil && name != "" {
			identity.Name = name
		}
	}
	return identity, nil
}

func workspaceName(repo, uuid string) (string, error) {
	data, ok, err := store.ReadJSONFile(filepath.Join(repo, core.ToRepoRel(core.OwnersRel)))
	if err != nil || !ok {
		return "", nil
	}
	workers, _ := data["workers"].(map[string]any)
	record, _ := workers[uuid].(map[string]any)
	if record == nil {
		return "", nil
	}
	name, _ := record["name"].(string)
	return trimSpace(name), nil
}
