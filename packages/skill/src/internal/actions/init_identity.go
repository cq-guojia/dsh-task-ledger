package actions

import (
	"crypto/rand"
	"encoding/hex"
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// init：初始化本机身份（写 ~/.taskledger/identity.json，一台机器只一次）。
// 只做逻辑，不打印、不读 stdin；交互在 shell 层。

// InitParams init 的入参。
type InitParams struct {
	Claim *string
	New   bool
	Name  string
}

func readWorkers(repo string) map[string]map[string]any {
	if repo == "" {
		return map[string]map[string]any{}
	}
	data, ok, err := store.ReadJSONFile(filepath.Join(repo, core.ToRepoRel(core.OwnersRel)))
	if err != nil || !ok {
		return map[string]map[string]any{}
	}
	workers, _ := data["workers"].(map[string]any)
	out := map[string]map[string]any{}
	for k, v := range workers {
		if record, ok := v.(map[string]any); ok {
			out[k] = record
		}
	}
	return out
}

// NewUUID 生成一个 v4 UUID。
func NewUUID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "00000000-0000-4000-8000-000000000000"
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	h := hex.EncodeToString(buf)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// InitIdentity 返回：already=true 表示幂等空转；need_choose=true 表示要把 options 交给用户选。

func InitIdentity(repo string, p InitParams) (map[string]any, error) {
	path, err := env.IdentityFile()
	if err != nil {
		return nil, err
	}
	existing, ok, err := env.ReadIdentity()
	if err != nil {
		return nil, err
	}
	if ok {
		// 已初始化 = 幂等空转；只有「认领另一个 uuid」才是真冲突
		if p.Claim == nil || core.Normalize(*p.Claim) == existing.UUID {
			return map[string]any{
				"already": true,
				"uuid":    existing.UUID,
				"name":    nilIfEmpty(existing.Name),
				"path":    path,
			}, nil
		}
		return nil, core.Failf("这台机器已经是 %s（%s），不能再认领 %s。\n  处理：要换身份请手动改该文件的 uuid；一台机器一个身份。", existing.UUID, path, strings.TrimSpace(*p.Claim))
	}

	workers := readWorkers(repo)
	var identity core.Identity
	switch {
	case p.Claim != nil:
		key := core.Normalize(*p.Claim)
		if !core.LooksLikeUUID(key) {
			return nil, core.Failf("认领目标不是 uuid：%s\n  处理：老台账（身份键是邮箱 / 名字）请改走 `init --new --name=<名字>`；先把那本台账迁到 uuid 身份，再谈认领。", strings.TrimSpace(*p.Claim))
		}
		record, present := workers[key]
		if !present {
			return nil, core.Failf("名册里没有 uuid=%s。\n  处理：不带参数跑一次 init 看可选用户，再 --claim 选一个。", *p.Claim)
		}
		name, _ := record["name"].(string)
		identity = core.Identity{UUID: key, Name: name}
	case len(workers) > 0 && !p.New:
		var options []any
		for key, record := range workers {
			name, _ := record["name"].(string)
			options = append(options, map[string]any{"uuid": key, "name": name})
		}
		return map[string]any{"need_choose": true, "path": path, "options": options}, nil
	default:
		if strings.TrimSpace(p.Name) == "" {
			if !p.New && p.Claim == nil && len(workers) == 0 {
				// 名册为空：没有可认领的人，名字只能由用户自己在终端里输入
				// （交互层问；agent 不得代写）。返回 need_name，不算错误。
				return map[string]any{"need_name": true, "path": path}, nil
			}
			return nil, core.Failf("新建身份必须输入一个名字（--name=<名字>）。")
		}
		identity = core.Identity{UUID: NewUUID(), Name: strings.TrimSpace(p.Name)}
	}

	if err := store.EnsureDir(filepath.Dir(path)); err != nil {
		return nil, err
	}
	// 两空格缩进、键序 uuid→name、末尾换行
	text := "{\n  \"uuid\": " + store.QuoteJSON(identity.UUID) + ",\n  \"name\": " + store.QuoteJSON(identity.Name) + "\n}\n"
	if err := store.WriteTextAtomic(path, text, false); err != nil {
		return nil, err
	}
	return map[string]any{"uuid": identity.UUID, "name": identity.Name, "path": path}, nil
}

// SwitchParams switch 的入参：--claim 认领名册里的 uuid，--new + --name 换一个全新身份。
type SwitchParams struct {
	Claim *string
	New   bool
	Name  string
}

// SwitchIdentity 给界面用：把本机身份换成另一个人（或建一个全新的）。
// 与 init 的区别只有一条 —— **允许覆盖已有身份**（init 在已初始化时只做幂等空转或拒绝）。
// 不写台账、不碰 git，只写机器身份文件；旧身份在名册里原样留着（历史归属不能断）。
func SwitchIdentity(repo string, p SwitchParams) (map[string]any, error) {
	var identity core.Identity
	switch {
	case p.Claim != nil && p.New:
		return nil, core.Failf("--claim 与 --new 不能同时给。")
	case p.Claim != nil:
		key := core.Normalize(*p.Claim)
		if !core.LooksLikeUUID(key) {
			return nil, core.Failf("认领目标不是 uuid：%s", strings.TrimSpace(*p.Claim))
		}
		record, present := readWorkers(repo)[key]
		if !present {
			return nil, core.Failf("名册里没有 uuid=%s。\n  处理：先看名册（owners --repo <工作区根>），再挑一个。", key)
		}
		name, _ := record["name"].(string)
		identity = core.Identity{UUID: key, Name: name}
	case p.New:
		if strings.TrimSpace(p.Name) == "" {
			return nil, core.Failf("新建身份必须给 --name=<名字>。")
		}
		identity = core.Identity{UUID: NewUUID(), Name: strings.TrimSpace(p.Name)}
	default:
		return nil, core.Failf("switch 要么 --new --name=<名字>，要么 --claim=<名册里的 uuid>。")
	}

	path, err := writeIdentity(identity)
	if err != nil {
		return nil, err
	}
	return map[string]any{"uuid": identity.UUID, "name": identity.Name, "path": path}, nil
}

// writeIdentity 把身份写回本机文件，返回文件路径。两空格缩进、键序 uuid→name、末尾换行。
func writeIdentity(identity core.Identity) (string, error) {
	path, err := env.IdentityFile()
	if err != nil {
		return "", err
	}
	if err := store.EnsureDir(filepath.Dir(path)); err != nil {
		return "", err
	}
	text := "{\n  \"uuid\": " + store.QuoteJSON(identity.UUID) + ",\n  \"name\": " + store.QuoteJSON(identity.Name) + "\n}\n"
	if err := store.WriteTextAtomic(path, text, false); err != nil {
		return "", err
	}
	return path, nil
}

// RenameSelf 改本机身份的昵称，返回（旧昵称, uuid）。
//
// **只写本机 identity.json**：名册里的那一份由调用方逐目录处理（每本台账各有一份，
// 散在各自的 git 仓库里，写与提交都得一个目录一个目录来）。
// 名字与现在完全一样 ⇒ 不写盘、幂等返回。
func RenameSelf(newName string) (string, string, error) {
	name := strings.TrimSpace(newName)
	if name == "" {
		return "", "", core.Failf("昵称不能为空。")
	}
	identity, ok, err := env.ReadIdentity()
	if err != nil {
		return "", "", err
	}
	if !ok {
		return "", "", core.Failf("这台机器还没有初始化身份，没有昵称可改。\n  处理：先 init 建一个身份。")
	}
	previous := identity.Name
	if previous == name {
		return previous, identity.UUID, nil
	}
	identity.Name = name
	if _, err := writeIdentity(identity); err != nil {
		return "", "", err
	}
	return previous, identity.UUID, nil
}

// OwnerNameIn 读某本台账名册（ledger/owners.json）里这个 uuid 现在的昵称。
//
// present=false 表示名册里没这个人（这台机器没在这本台账写过东西）。
// **用来"不碰网络就能判断要不要改"**：九本台账逐本去远端取一次，光等网络就要一分钟。
func OwnerNameIn(repo, uuid string) (name string, present bool, err error) {
	index := store.NewOwnersIndex(repo)
	data, err := index.Store.Data()
	if err != nil {
		return "", false, err
	}
	workers, _ := data["workers"].(map[string]any)
	record, present := workers[core.Normalize(uuid)].(map[string]any)
	if !present {
		return "", false, nil
	}
	current, _ := record["name"].(string)
	return current, true, nil
}

// RenameInOwners 改某本台账名册（ledger/owners.json）里这个 uuid 的昵称。
//
// 返回值三态：changed=真改了；present=名册里有没有这个人。
// 没有这个人 ⇒ (false,false,nil) 且不报错：跳过，**绝不凭空加人** —— 没在这本台账写过东西的人
// 本来就不在册。(false,true,nil) = 名字已经是这个，不写盘。
// **只动 name 这一项**：file（分片名，是 uuid 的 hash）、joined 都不碰，所以改名不会变成"新人"。
func RenameInOwners(repo, uuid, name string) (changed bool, present bool, err error) {
	index := store.NewOwnersIndex(repo)
	data, err := index.Store.Data()
	if err != nil {
		return false, false, err
	}
	workers, _ := data["workers"].(map[string]any)
	record, present := workers[core.Normalize(uuid)].(map[string]any)
	if !present {
		return false, false, nil
	}
	if current, _ := record["name"].(string); current == name {
		return false, true, nil
	}
	record["name"] = name
	if err := index.Store.Flush(data); err != nil {
		return false, true, err
	}
	return true, true, nil
}
