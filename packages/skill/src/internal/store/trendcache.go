package store

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 趋势缓存：**一月一文件**（本地月），文件内按天存明细，周期（周 / 月 / 年）一律由天拼。
// 本机私有、不进 git：目录在 ~/.taskledger/cache/trend/<仓库哈希>/<时区>/。
//
// 三条硬边界：
//   - 坏 JSON 当成没有（重算覆盖），写失败静默降级为实时算 —— 缓存永远不是正确性依赖；
//   - 校验只认**该月自己的**源文件指纹（size + mtime_ns），不追后续月份（2026-10-29 定稿）；
//   - 时区只由目录名决定，JSON 里不再存 tz 做自检（手挪目录是使用者自己的事）。

// TrendDay 一个本地日期的三计数。Open 是该日**结束时**仍未结案的条数。
type TrendDay struct {
	Day       string `json:"day"`
	Added     int    `json:"added"`
	Done      int    `json:"done"`
	Cancelled int    `json:"cancelled"`
	Open      int    `json:"open"`
}

// TrendOwnerDay 一个人一个本地日期的两计数（按人没有「剩余」，见 2026-10-29 H1/H2）。
type TrendOwnerDay struct {
	Day       string `json:"day"`
	Added     int    `json:"added"`     // 按 creator（展示：我提的）
	Owned     int    `json:"owned"`     // 按 owner 的新建（倒推未结用；algo 2 起才有）
	Done      int    `json:"done"`      // 按 owner（我结掉的）
	Cancelled int    `json:"cancelled"` // 按 owner（我作废的）
}

// TrendSource 一个源文件的指纹。Size = -1 表示「当时这个文件不存在」——
// 它后来出现同样是变化（补录一批往月结案），必须重算。
type TrendSource struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	MtimeNS int64  `json:"mtime_ns"`
}

// TrendMonth 一个本地月的缓存内容。
type TrendMonth struct {
	Algo         int                        `json:"algo"`
	WeekStart    string                     `json:"week_start"`
	MonthEndOpen int                        `json:"month_end_open"`
	Source       []TrendSource              `json:"source"`
	Days         []TrendDay                 `json:"days"`
	PerOwner     map[string][]TrendOwnerDay `json:"per_owner"`
	// PerOwnerEndOpen 本月末每人未结（= 进行中），下个月往后推的锚；也是锚点文件的来源。
	PerOwnerEndOpen map[string]int `json:"per_owner_end_open,omitempty"`
}

// TrendCacheDir 某台机器、某个仓库、某个时区偏移下的缓存目录。
// 仓库标识 = 绝对路径 sha1 前 16 位；offset 编码成 +0800（Windows 不允许冒号）。
func TrendCacheDir(home, repo string, offsetSeconds int) string {
	sum := sha1.Sum([]byte(repo))
	sign := "+"
	if offsetSeconds < 0 {
		sign, offsetSeconds = "-", -offsetSeconds
	}
	zone := fmt.Sprintf("%s%02d%02d", sign, offsetSeconds/3600, offsetSeconds%3600/60)
	return filepath.Join(home, ".taskledger", "cache", "trend", hex.EncodeToString(sum[:])[:16], zone)
}

// LoadTrendMonth 读一个月的缓存；不存在 / 坏 JSON / algo 对不上都当「没有」。
func LoadTrendMonth(dir, ym string, algo int) (*TrendMonth, bool) {
	raw, err := os.ReadFile(filepath.Join(dir, ym+".json"))
	if err != nil {
		return nil, false
	}
	var m TrendMonth
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, false
	}
	if m.Algo != algo || len(m.Days) == 0 {
		return nil, false
	}
	return &m, true
}

// SaveTrendMonth 原子写一个月的缓存（临时文件 + rename，多进程同时写结果一致）。
func SaveTrendMonth(dir, ym string, m *TrendMonth) error {
	if err := EnsureDir(dir); err != nil {
		return err
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return core.Failf("序列化 %s 趋势缓存失败：%v", ym, err)
	}
	return WriteTextAtomic(filepath.Join(dir, ym+".json"), string(raw)+"\n", false)
}

// TrendSourcesMatch 源文件指纹是否与记录一致（任一个变了就重算）。
func TrendSourcesMatch(repo string, sources []TrendSource) bool {
	if len(sources) == 0 {
		return false
	}
	for _, src := range sources {
		info, err := os.Stat(filepath.Join(repo, filepath.FromSlash(src.Path)))
		if err != nil {
			if src.Size == -1 && src.MtimeNS == 0 {
				continue // 当时不存在、现在也没有 ⇒ 没变
			}
			return false
		}
		if src.Size == -1 || info.Size() != src.Size || info.ModTime().UnixNano() != src.MtimeNS {
			return false
		}
	}
	return true
}
