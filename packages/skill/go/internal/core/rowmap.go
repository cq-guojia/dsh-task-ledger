package core

// ToMap 一条历史行 → 字典（键名与顺序是插件看板依赖的契约）。
func (r Row) ToMap() map[string]any {
	tags := r.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"finished":     r.Finished,
		"created":      r.Created,
		"title":        r.Title,
		"category":     r.Category,
		"tags":         tags,
		"owner":        r.Owner,
		"owner_name":   r.OwnerName,
		"creator":      r.Creator,
		"creator_name": r.CreatorName,
		"summary":      r.Summary,
		"worklog":      r.Worklog,
		"line":         r.Line,
	}
}
