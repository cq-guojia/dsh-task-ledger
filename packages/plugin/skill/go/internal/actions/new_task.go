package actions

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 建任务：拿外壳算好的任务号写过程文档、写进池（或直接写进自己的分片）。
// tid / created 由外壳算好传进来（锁层要靠它们算出那篇文档的路径），业务层不许现算现用。

// NewFields 建任务会写的字段名。
var NewFields = []string{"created", "title", "status", "owner", "creator", "worklog"}

// NewTaskParams 建任务的入参。
type NewTaskParams struct {
	Title    string
	Tid      string
	Created  string
	Category *string
	Tags     []string
	Mine     bool
}

// NewTask 写序：ensure_dir(当月文档目录) → 过程文档（含首条记录）→ 台账。
func NewTask(repo string, me core.Identity, p NewTaskParams) (*Result, error) {
	if strings.TrimSpace(p.Title) == "" {
		return nil, core.Failf("标题不能为空。")
	}
	if p.Tid == "" {
		return nil, core.Failf("建任务必须由外壳先算好任务号（内部错误：tid 为空）。")
	}
	if p.Created == "" {
		return nil, core.Failf("建任务必须由外壳先算好创建时间（内部错误：created 为空）。")
	}
	tid, err := core.RequireTaskID(p.Tid)
	if err != nil {
		return nil, err
	}
	cleanTitle := strings.Join(strings.Fields(p.Title), " ")
	category := ""
	if p.Category != nil {
		if category, err = core.NormalizeLabel(*p.Category, "分类"); err != nil {
			return nil, err
		}
	}
	tagList, err := core.ParseTags(p.Tags)
	if err != nil {
		return nil, err
	}

	mineStore := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	target := pool
	if p.Mine {
		target = mineStore
	}

	if task, ok, err := target.Get(tid); err != nil {
		return nil, err
	} else if ok && task != nil {
		return nil, core.Failf("任务号 %s 已经存在了（这不是重跑，是重号）。", tid)
	}
	other := pool
	if p.Mine {
		other = mineStore
	}
	if task, ok, err := other.Get(tid); err != nil {
		return nil, err
	} else if ok && task != nil {
		return nil, core.Failf("任务号 %s 已经存在了（这不是重跑，是重号）。", tid)
	}

	docRel := core.WorklogRel(tid, p.Created)
	path := filepath.Join(repo, core.ToRepoRel(docRel))
	if _, statErr := os.Stat(path); statErr == nil {
		return nil, core.Failf("任务号 %s 的过程文档已经存在（同名号的在办 / 已结案任务占着同一篇文档）。\n  处理：换一个 --id，别复用历史号。\n  若上次 new 崩在中间（文档已写、台账没落），这篇就是它留下的：确认内容要保留就换号重建；非要复用这一号，先把那篇文档挪走再重跑。", tid)
	}

	logs := store.NewWorklogStore(repo)
	beforeDoc, hadDoc, err := store.Snapshot(path)
	if err != nil {
		return nil, err
	}

	status := "open"
	var owner, ownerName any
	if p.Mine {
		status = "doing"
		owner = me.UUID
		ownerName = nilIfEmpty(me.Name)
	}
	task := map[string]any{
		"title":        cleanTitle,
		"created":      p.Created,
		"status":       status,
		"owner":        owner,
		"owner_name":   ownerName,
		"creator":      me.UUID,
		"creator_name": nilIfEmpty(me.Name),
		"category":     nilIfEmpty(category),
		"tags":         tagList,
		"worklog":      docRel,
		"started":      nil,
		"updated":      p.Created,
		"finished":     nil,
	}
	if p.Mine {
		task["started"] = p.Created
	}

	kind := "创建任务"
	if p.Mine {
		kind = "创建任务并认领"
	}
	line := core.StatusLine{Status: status, When: p.Created}
	if p.Mine {
		line.Name = me.Name
		line.UUID = me.UUID
	}

	if err = store.EnsureDir(filepath.Dir(path)); err == nil {
		_, err = logs.Create(tid, cleanTitle, p.Created, me.Stamp(), tagList, &line,
			core.ExecLine(p.Created, me.Stamp(), "new", kind))
	}
	if err == nil {
		err = target.Put(tid, task)
	}
	if err != nil {
		_ = target.Drop(tid)
		_ = store.Restore(path, beforeDoc, hadDoc)
		return nil, err
	}

	text, readErr := logs.Read(path)
	var view WorklogView
	viewPath := Rel(repo, path)
	view.Path = &viewPath
	if readErr == nil {
		view.Text = &text
	} else {
		msg := readErr.Error()
		view.Error = &msg
	}
	message := "新建任务 " + tid + "：" + cleanTitle
	return &Result{
		Changed: NewFields,
		Where:   StrOrNil(Rel(repo, target.Path)),
		Message: &message,
		Worklog: &view,
		Payload: map[string]any{"tid": tid},
		Notices: []string{"新建过程文档：" + Rel(repo, path)},
	}, nil
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
