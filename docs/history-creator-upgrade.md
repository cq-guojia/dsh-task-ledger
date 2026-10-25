# history 手动升级 11 列（owner_name / creator_name 两列）——一次性，照着跑

> 单人项目、不走自动迁移。本文档列出**全部**工作区的历史文件，逐个改完即升级结束，永久生效。
> ⚠️ 脚本**只认十一列**：没升级的文件整篇读不出来（列数不对的行会被 `parse_history` 跳过并警告）。

## 一、要改什么

每个历史文件只改三类行：

**1. 表头行**（带「结案时间」的那行）→ 换成：

```
| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | owner_name | creator | creator_name | 完成了什么 | 过程文档 |
```

**2. 分隔行** → 换成：

```
|---|---|---|---|---|---|---|---|---|---|---|
```

**3. 每条数据行**（以 `| 2026` 开头）→ 在 `owner` 后面插一格名字、在 `creator` 后面插一格名字：

```
改前（9 列）：| … | 标签 | @<uuid> | @<uuid> | 做了什么 | [../worklog/…](…) |
改后（11 列）：| … | 标签 | @<uuid> | <名字> | @<uuid> | <名字> | 做了什么 | [../worklog/…](…) |
```

四列各填什么：

| 列 | 填什么 |
|---|---|
| `owner` / `creator` | `@` + **裸 uuid**（该工作区 `ledger/owners.json` 里的键）。**不是名字、不是邮箱** —— 归属判定只比 uuid |
| `owner_name` / `creator_name` | 该 uuid 在名册里的 `name`，**原值、不加 `@`**（`@` 只属于 uuid 那两列） |

⚠️ 存量九列的文件里 owner / creator 两列**有的写的是名字或邮箱**（老身份体系），要**先换成 uuid** 再插名字列 —— 否则 `--owner` / `--mine` 永远比不到东西。

名字是**快照**：落的是结案那一刻的名字，之后改名不回写旧行。

## 二、逐文件清单

| # | 文件（绝对路径） | 状态 |
|---|---|---|
| 1 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202609.md` | 待迁 |
| 2 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202610.md` | 待迁 |
| 3 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202609.md` | 待迁 |
| 4 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202610.md` | 待迁 |
| 5 | `/code/dsh-plugins/dsh-task-ledger/ledger/history/202610.md` | ✅ 已迁（2026-10-25，29 行） |
| 6 | `/code/open-lab/rulemux/ledger/history/202610.md` | 待迁 |
| 7 | `/code/koc/koc-weapp/koc-weapp-zuche/ledger/history/202610.md` | 待迁 |

> 以后若出现旧平铺文件 `ledger/PROGRESS-HISTORY.md`（目前各工作区都没有），不读（脚本只认 `history/<年月>.md`）。

## 三、改法 A：手动改

打开文件 → 换表头 → 换分隔行 → 每条数据行在 owner 后插名字、creator 后插名字。
改完自检：**每条数据行应该有 13 个竖杠 `|`**（11 列）。

```bash
# 自检：这个数应该 = 文件里的数据行数
awk -F'|' 'NF==13 && /^ *\| *2026/' 文件.md | wc -l
```

## 四、改法 B：一条命令改一个文件（推荐，不会错位）

对清单里每个文件，把 `FILE=` 换成对应路径、`NAME=` 换成该工作区名册里的名字跑一次（复制整段即可）。
**前提**：owner / creator 两列已经是 `@<uuid>`；不是就先手工换成 uuid。

```bash
FILE=/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202609.md NAME=GuoJia-Agent python3 - <<'EOF'
import os
p, name = os.environ['FILE'], os.environ['NAME']
lines = open(p, encoding='utf-8').read().splitlines(True)
out, n = [], 0
for ln in lines:
    s = ln.strip()
    if s.startswith('|') and '结案时间' in s:
        out.append("| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | owner_name | creator | creator_name | 完成了什么 | 过程文档 |\n")
    elif s.startswith('|') and not s.replace('|', '').replace('-', '').strip():
        out.append("|---|---|---|---|---|---|---|---|---|---|---|\n")
    elif s.startswith('|'):
        cells = s.split('|')
        if len(cells) == 11:                  # 9 列 + 首尾空
            cells.insert(8, f' {name} ')      # creator_name
            cells.insert(7, f' {name} ')      # owner_name
            out.append('|'.join(cells) + '\n')
            n += 1
        else:
            out.append(ln)
    else:
        out.append(ln)
open(p, 'w', encoding='utf-8').write(''.join(out))
print(f'ok {p}（升级 {n} 行）')
EOF
```

脚本只动表格行，标题 / 空行 / 散文原样保留；已经是 11 列的行原样跳过（重复跑安全）。

## 五、改完之后

- 脚本结案新任务直接写 11 列（名字从任务行的 `owner_name` / `creator_name` 带走），和手改格式一致，无缝衔接。
- 老行没有名字列时，读的时候按名册兜底补一次展示值，**不回写文件**，不会崩也不会错。
- 验证：`python3 <skill>/scripts/progress.py history --months 12 --json --repo <工作区根>` —— 每条记录都该有 `owner_name` / `creator_name`，且 `warnings` 为空。
