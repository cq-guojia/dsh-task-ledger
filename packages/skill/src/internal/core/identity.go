package core

import (
	"regexp"
	"strings"
)

// 身份这个值对象：uuid 是唯一键，name 只用于显示与查询筛选。

// UUIDRe 合法身份键的形态（8-4-4-4-12 的十六进制 UUID）。
var UUIDRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Identity 一个人的身份。uuid 是唯一键，name 只用于显示。
type Identity struct {
	UUID string
	Name string
}

// Label 显示名：没名字就用 uuid 前 8 位。
func (i Identity) Label() string {
	if i.Name != "" {
		return i.Name
	}
	if len(i.UUID) > 8 {
		return i.UUID[:8]
	}
	return i.UUID
}

// Stamp 落盘用的身份串：`名字 · uuid`（不带 @，@ 由各落点自己加）。
func (i Identity) Stamp() string {
	if i.Name == "" {
		return i.UUID
	}
	return i.Name + " · " + i.UUID
}

// Normalize 归一化：去首尾空白 + 转小写。全仓只此一处。
func Normalize(who string) string { return strings.ToLower(strings.TrimSpace(who)) }

// LooksLikeUUID 是不是一个 UUID 形态的身份键。
func LooksLikeUUID(who string) bool { return UUIDRe.MatchString(Normalize(who)) }

// IsMe who（uuid）是不是这个人。全站只认 uuid 这一个身份键。
func IsMe(identity Identity, who string) bool {
	return Normalize(who) == Normalize(identity.UUID)
}
