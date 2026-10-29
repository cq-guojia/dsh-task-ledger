package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// 月度锚点：每个月末的「未结」快照（全局 + 按人）。
//
// 为什么要它：未结是**结果**，历史一旦定下就不变（台账只追加）。但按人未结必须知道
// 「上个月末各人挂着几条」才能往后推算。整月缓存太重（只该写用户查的那几个月），
// 所以把每个月末的几十个字节单独存一份 —— 倒推时顺手就写下来了，之后读任何历史段
// 都只用「最近的左锚 + 那一段的流水」，不必再从今天倒推。
type TrendAnchor struct {
	Open   int            `json:"open"`
	Owners map[string]int `json:"owners,omitempty"`
}

// TrendAnchors 一个仓库（一个时区）的全部月度锚点。
type TrendAnchors struct {
	Algo   int                    `json:"algo"`
	Months map[string]TrendAnchor `json:"months"`
}

// LoadTrendAnchors 读锚点文件；不存在 / 坏 JSON / algo 不符都当空（重新攒）。
func LoadTrendAnchors(dir string, algo int) *TrendAnchors {
	empty := &TrendAnchors{Algo: algo, Months: map[string]TrendAnchor{}}
	raw, err := os.ReadFile(filepath.Join(dir, "anchors.json"))
	if err != nil {
		return empty
	}
	var a TrendAnchors
	if err := json.Unmarshal(raw, &a); err != nil || a.Algo != algo || a.Months == nil {
		return empty
	}
	return &a
}

// SaveTrendAnchors 原子写锚点文件（写不进去就算了，只是下次还得倒推）。
func SaveTrendAnchors(dir string, a *TrendAnchors) error {
	if len(a.Months) == 0 {
		return nil
	}
	if err := EnsureDir(dir); err != nil {
		return err
	}
	raw, err := json.Marshal(a)
	if err != nil {
		return err
	}
	return WriteTextAtomic(filepath.Join(dir, "anchors.json"), string(raw)+"\n", false)
}
