# history 手动升级 9 列（creator 列）——一次性，照着跑

> 开发期、单人项目（创建人只有 `GuoJia-Agent`），不走自动迁移。
> 本文档列出**全部**工作区的全部历史文件，逐个改完即升级结束，永久生效。

## 一、要改什么

每个历史文件只改两类行：

**1. 表头行**（带「结案时间」的那行）→ 换成：

```
| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |
```

**2. 分隔行** → 多加一段：

```
|---|---|---|---|---|---|---|---|---|
```

**3. 每条数据行**（以 `| 2026` 开头）→ 在 `owner` 列后面**插入一格** `@GuoJia-Agent`：

```
改前：| 2026-10-16 09:18:12 | 2026-10-16 08:22:40 | 某任务 | 调研 | 标签 | @GuoJia-Agent | 做了什么 | [../worklog/…](../worklog/…) |
改后：| 2026-10-16 09:18:12 | 2026-10-16 08:22:40 | 某任务 | 调研 | 标签 | @GuoJia-Agent | @GuoJia-Agent | 做了什么 | [../worklog/…](../worklog/…) |
```

## 二、逐文件清单（共 7 个，全部要改）

| # | 文件（绝对路径） |
|---|---|
| 1 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202609.md` |
| 2 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202610.md` |
| 3 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202609.md` |
| 4 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202610.md` |
| 5 | `/code/dsh-plugins/dsh-task-ledger/ledger/history/202610.md` |
| 6 | `/code/open-lab/rulemux/ledger/history/202610.md` |
| 7 | `/code/koc/koc-weapp/koc-weapp-zuche/ledger/history/202610.md` |

> 以后若出现旧平铺文件 `ledger/PROGRESS-HISTORY.md`（目前 5 个工作区都没有），同样改法。

## 三、改法 A：手动改

打开文件 → 换表头 → 分隔行多一段 → 每条数据行在 `owner` 后插 `@GuoJia-Agent |`。
改完自检：**每条数据行应该有 11 个竖杠 `|`**（9 列）。

```bash
# 自检：这个数应该 = 文件里的数据行数
awk -F'|' 'NF==11 && /^ *\| *2026/' 文件.md | wc -l
```

## 四、改法 B：一条命令改一个文件（推荐，不会错位）

对清单里每个文件，把 `FILE=` 换成对应路径跑一次（复制整段即可）：

```bash
FILE=/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202609.md python3 - <<'EOF'
import os
p = os.environ['FILE']
lines = open(p, encoding='utf-8').read().splitlines(True)
out, n = [], 0
for ln in lines:
    s = ln.strip()
    if s.startswith('|') and '结案时间' in s:
        out.append("| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |\n")
    elif s.startswith('|') and not s.replace('|', '').replace('-', '').strip():
        out.append("|---|---|---|---|---|---|---|---|---|\n")
    elif s.startswith('|'):
        cells = [c.strip() for c in s.strip('|').split('|')]
        if len(cells) == 8:
            cells.insert(6, '@GuoJia-Agent')
            out.append('| ' + ' | '.join(cells) + ' |\n')
            n += 1
        else:
            out.append(ln)
    else:
        out.append(ln)
open(p, 'w', encoding='utf-8').write(''.join(out))
print(f'ok {p}（升级 {n} 行）')
EOF
```

脚本只动表格行，标题/空行/散文原样保留；已经是 9 列的行原样跳过（重复跑安全）。

## 五、改完之后

- skill（1.1.0）结案新任务直接写 9 列，和手改格式一致，无缝衔接。
- skill 里读侧的兜底逻辑保留不动：万一哪格空着，读的时候按 owner 兜底，**不会崩、不会错**；
  手改填满后兜底自然闲置，读历史零额外开销。
- 验证：打开看板，勾「只看我的」，**新增**列应包含「我创建、别人负责」的任务；已结案列表（近 13 个月）正常显示。
