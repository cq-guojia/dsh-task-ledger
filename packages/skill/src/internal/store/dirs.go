package store

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 机器级台账目录清单：~/.taskledger/ledgers.json，**路径当 key**（天然去重）。
//
// 它不是台账真源 —— 真源仍是各工作区自己的 ledger/；这里只记「去哪找、叫什么名字、看不看得见」。
// 本机私有、不进任何 git 仓库（写入 track=false）。

// DirEntry 清单里的一条。
type DirEntry struct {
	Path   string
	Name   string
	Hidden bool
}

// ReadDirs 读清单。
//
// 文件不存在 / 空文件 ⇒ 空清单、broken=false。
// 有内容但读不懂 ⇒ broken=true（调用方当空处理，**写之前先把它改名保命**，绝不静默覆盖）。
func ReadDirs(path string) (entries []DirEntry, broken bool, err error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, core.Failf("读 %s 失败：%v", path, err)
	}
	if strings.TrimSpace(string(raw)) == "" {
		return nil, false, nil
	}
	var data map[string]map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, true, nil
	}
	entries = make([]DirEntry, 0, len(data))
	for p, fields := range data {
		entry := DirEntry{Path: p}
		if name, ok := fields["name"].(string); ok {
			entry.Name = strings.TrimSpace(name)
		}
		if hidden, ok := fields["hidden"].(bool); ok {
			entry.Hidden = hidden
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, false, nil
}

// WriteDirs 整份替换清单。broken 为真时先把原文件改名成 <名字>.broken（不丢用户手写的内容）。
func WriteDirs(path string, entries []DirEntry, broken bool) error {
	if broken {
		if err := os.Rename(path, path+".broken"); err != nil {
			return core.Failf("备份坏掉的 %s 失败：%v", path, err)
		}
	}
	rows := make(map[string]any, len(entries))
	for _, entry := range entries {
		fields := map[string]any{}
		if entry.Name != "" {
			fields["name"] = entry.Name
		}
		if entry.Hidden {
			fields["hidden"] = true
		}
		rows[entry.Path] = fields
	}
	if err := EnsureDir(filepath.Dir(path)); err != nil {
		return err
	}
	// 缩进写，不用 DumpJSON 的紧凑格式：这是**配置**，改名 / 临时隐藏目前只能手改这个文件
	// （台账那些 JSON 是程序数据，紧凑才不会让 diff 全是噪音）。
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(rows); err != nil {
		return core.Failf("序列化 %s 失败：%v", path, err)
	}
	return WriteTextAtomic(path, buf.String(), false)
}
