package store

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
)

// 索引 owners.json：谁是登记过的人、各自的分片文件是哪个、新人的登记与改名。
// **分片只认索引，不扫目录** —— 唯一例外是 DiskShards()，只给 validate 用。

// OwnersIndex 名册。
type OwnersIndex struct {
	Repo  string
	Store *JSONStore
}

// NewOwnersIndex 打开一个工作区的名册。
func NewOwnersIndex(repo string) *OwnersIndex {
	return &OwnersIndex{
		Repo: repo,
		Store: NewJSONStore(
			filepath.Join(repo, core.ToRepoRel(core.OwnersRel)),
			"workers",
			map[string]any{"version": "", "workers": map[string]any{}},
		),
	}
}

// Get 取一个人的记录。
func (o *OwnersIndex) Get(who string) (map[string]any, bool, error) {
	return o.Store.Get(core.Normalize(who))
}

// All 全部登记的人。
func (o *OwnersIndex) All() (map[string]map[string]any, error) { return o.Store.All() }

// Ensure 登记 / 补 joined。name 只在首次登记时写入。返回 (这次写了没有, 记录)。
func (o *OwnersIndex) Ensure(me core.Identity) (bool, map[string]any, error) {
	key := core.Normalize(me.UUID)
	data, err := o.Store.Data()
	if err != nil {
		return false, nil, err
	}
	workers, ok := data["workers"].(map[string]any)
	if !ok {
		workers = map[string]any{}
		data["workers"] = workers
	}
	if record, present := workers[key].(map[string]any); present {
		copied := map[string]any{}
		for k, v := range record {
			copied[k] = v
		}
		return false, copied, nil
	}
	record := map[string]any{
		"file":   filepath.Base(core.ShardRel(key)),
		"name":   me.Name,
		"joined": core.Now(),
	}
	workers[key] = record
	if err := o.Store.Flush(data); err != nil {
		return false, nil, err
	}
	copied := map[string]any{}
	for k, v := range record {
		copied[k] = v
	}
	return true, copied, nil
}

// KeysOfName 显示名模糊匹配（不分大小写的子串）⇒ uuid 集合。只给查询筛选用。
func (o *OwnersIndex) KeysOfName(fragment string) (map[string]bool, error) {
	needle := core.Normalize(fragment)
	out := map[string]bool{}
	if needle == "" {
		return out, nil
	}
	all, err := o.All()
	if err != nil {
		return nil, err
	}
	for key, record := range all {
		name, _ := record["name"].(string)
		if strings.Contains(core.Normalize(name), needle) {
			out[key] = true
		}
	}
	return out, nil
}

// Shards 身份 → 分片绝对路径（只信索引）。
func (o *OwnersIndex) Shards() (map[string]string, error) {
	all, err := o.All()
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for key, record := range all {
		name, _ := record["file"].(string)
		if name == "" {
			continue
		}
		out[key] = filepath.Join(o.Repo, core.ToRepoRel(core.OwnersDir), name)
	}
	return out, nil
}

// DiskShards 扫 owners/ 下的全部 *.json。**全仓唯一扫目录的地方**，只给 validate。
func (o *OwnersIndex) DiskShards() []string {
	base := filepath.Join(o.Repo, core.ToRepoRel(core.OwnersDir))
	entries, err := os.ReadDir(base)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		out = append(out, filepath.Join(base, e.Name()))
	}
	sort.Strings(out)
	return out
}

// AssertPresent 登记过的分片（含池）文件必须都在；被人删了/改名了就报清楚，绝不悄悄当空。
func (o *OwnersIndex) AssertPresent() error {
	shards, err := o.Shards()
	if err != nil {
		return err
	}
	var missing []string
	for _, p := range shards {
		if _, err := os.Stat(p); err != nil {
			missing = append(missing, p)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return core.Failf("台账里登记的任务文件找不到了（可能被人手动删除或改名）：\n  %s\n程序不自动修复——请用 git 恢复原文件（git checkout -- <文件>），或把原文件放回原处，再重试。", strings.Join(missing, "\n  "))
	}
	if _, err := os.Stat(filepath.Join(o.Repo, core.ToRepoRel(core.OwnersRel))); os.IsNotExist(err) {
		if len(o.DiskShards()) > 0 {
			return core.Failf("台账索引 owners.json 找不到了，但 owners/ 下还有任务文件（可能被人手动删除或改名）。\n程序不自动修复——请用 git 恢复 owners.json，再重试。")
		}
	}
	return nil
}
