package actions

import (
	"crypto/rand"
	"encoding/hex"
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
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
