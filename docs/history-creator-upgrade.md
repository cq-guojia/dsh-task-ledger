# history 手动升级：`@` 挪到名字列 —— 一次性，照着跑

> 单人项目、不走自动迁移。本文档列出**全部**工作区的历史文件，逐个改完即升级结束，永久生效。
> ⚠️ 2026-10-26 口径变更：**`@` 只加在名字列，`owner` / `creator` 两列写裸 uuid**（与过程文档 `@名字 · uuid` 一致）。改前是反的（`@<uuid>` + 裸名字），脚本已按新口径输出，存量文件按本文一次性改正。

## 一、要改什么

表头行、分隔行**都不动**（仍是十一列）。只改**每条数据行**（以 `| 2026` 开头）：

```
改前（旧 @ 位置）：| … | 标签 | @<uuid> | <名字> | @<uuid> | <名字> | 做了什么 | [../worklog/…](…) |
改后（新 @ 位置）：| … | 标签 | <uuid>  | @<名字> | <uuid>  | @<名字> | 做了什么 | [../worklog/…](…) |
```

| 列 | 填什么 |
|---|---|
| `owner` / `creator` | **裸 uuid**，不带 `@`（该工作区 `ledger/owners.json` 里的键）。归属判定只比这个值 |
| `owner_name` / `creator_name` | **`@` + 该 uuid 在名册里的 `name`**。`@` 纯展示，读时剥掉 |

## 二、逐文件清单

| # | 文件（绝对路径） | 状态 |
|---|---|---|
| 1 | `/code/dsh-plugins/dsh-plugin-core/ledger/history/202610.md` | 待改 |
| 2 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202609.md` | 待改 |
| 3 | `/code/dsh-plugins/dsh-task-dispatch-table/ledger/history/202610.md` | 待改 |
| 4 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202609.md` | 待改 |
| 5 | `/code/dsh-plugins/dsh-session-title-pattern/ledger/history/202610.md` | 待改 |
| 6 | `/code/dsh-plugins/dsh-task-ledger/ledger/history/202610.md` | 待改 |
| 7 | `/code/open-lab/rulemux/ledger/history/202610.md` | 待改 |
| 8 | `/code/koc/koc-weapp/koc-weapp-zuche/ledger/history/202610.md` | 待改 |
| 9 | `/workspace/Explore/ledger/history/202610.md` | 待改 |
| 10 | `/workspace/NAS-Docker/ledger/history/202610.md` | 待改 |

> 如果又出现旧平铺文件 `ledger/PROGRESS-HISTORY.md`，不读（脚本只认 `history/<年月>.md`）。

## 三、改法 A：手动改

打开文件 → 每条数据行把 owner / creator 两列前面的 `@` 删掉，名字列前面加上 `@`。
改完自检：**每条数据行应该有 13 个竖杠 `|`**（11 列）。

```bash
# 自检：这个数应该 = 文件里的数据行数
awk -F'|' 'NF==13 && /^ *\| *2026/' 文件.md | wc -l
```

## 四、改法 B：一条命令改一个文件（推荐，不会错位）

对清单里每个文件，把 `FILE=` 换成对应路径跑一次（复制整段即可）。重复跑安全：已经是新口径的行不动。

```bash
FILE=/code/dsh-plugins/dsh-plugin-core/ledger/history/202610.md python3 - <<'EOF'
import os
p = os.environ['FILE']
out, n = [], 0
for ln in open(p, encoding='utf-8').read().splitlines(True):
    s = ln.strip()
    if s.startswith('|') and len(s.split('|')) == 13:      # 11 列 + 首尾空
        cells = s.split('|')
        for i in (6, 8):                                    # owner_name / creator_name
            name = cells[i].strip().lstrip('@')
            cells[i] = f' @{name} ' if name else ' '
        for i in (5, 7):                                    # owner / creator
            cells[i] = f' {cells[i].strip().lstrip("@")} '
        out.append('|'.join(cells) + '\n')
        n += 1
    else:
        out.append(ln)
open(p, 'w', encoding='utf-8').write(''.join(out))
print(f'ok {p}（改 {n} 行）')
EOF
```

脚本只动数据行，标题 / 表头 / 分隔行 / 空行 / 散文原样保留。

## 五、改完之后

- 脚本结案新任务直接按新口径写，和手改格式一致，无缝衔接。
- 验证：`python3 <skill>/scripts/progress.py history --months 12 --json --repo <工作区根>`
  —— `owner` / `creator` 应是裸 uuid、`owner_name` / `creator_name` 不带 `@`，`warnings` 为空。
- 再跑一遍 `validate --deep`，确认归属判定（`--mine` / `--owner`）仍然命中。
