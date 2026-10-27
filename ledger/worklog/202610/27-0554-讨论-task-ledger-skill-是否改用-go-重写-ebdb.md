# 20261027-0554-讨论-task-ledger-skill-是否改用-go-重写-ebdb：讨论 task-ledger skill 是否改用 Go 重写

- **状态**：doing · 2026-10-27 06:27:16 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-27 05:54:11 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

**问题**：skill 每条命令都起一次 `python3`（`packages/skill/scripts/progress.py:15-20`），看板一次刷新会连起多次（snapshot 每工作区 2 次 `home.service.ts:34-37`，trend 每工作区 3 次 `trend.service.ts:42-46`，两段串行 `client/store.ts:105-140`）。用户原话：「一个命令可能会调 N 个脚本去执行……等待打开的时间可能直接就一两秒，这太费劲了」，要求评估改成编译好的二进制、拷进 skill 直接调用，且**用户本机不得有任何安装成本**。

**要回答的三个问题**：技术可行性 / 优化率 / 依赖。落地任务见 `20261027-0624-skill-脚本改用-go-重写-527f`。

## 待办

- 无。本轮调研已覆盖三个问题，开工项全部转移至 `20261027-0624-skill-脚本改用-go-重写-527f` 的「待办」。

## 下一步

- 本任务已无后续动作；继续推进看 `20261027-0624-skill-脚本改用-go-重写-527f`。

## 过程

**① 现状开销分解**（本机 4 核 Linux 容器、Python 3.13.5、20 次均摊）：

| 环节 | 单次 |
|---|---|
| `python3 -c pass` | 59 ms |
| 加导入全部模块 | 171 ms（导入约 112 ms，`actions.registry` 一次性 import 全部 11 个 action） |
| 加真实干活 `list` | 178 ms（业务本身约 7 ms） |

⇒ **96% 花在启动与导入**；15 并发实测 1.18s wall / 2.87s CPU。

**② Go 产物实测（不是推断）**：darwin/arm64 2737 KB；Mach-O 里 `LC_CODE_SIGNATURE(0x1d)` 与 `LC_UUID(0x1b)` 均在（Go 内部链接器自动 ad-hoc 签名）；用户 M 芯片 Mac 实跑输出 `binary ok: {"arch":"arm64","os":"darwin"} (startup=536µs)`；linux/amd64 `ldd` → `not a dynamic executable`；windows/amd64 2967 KB，`objdump -p` 导入表只有 `kernel32.dll`，`MajorOSystemVersion 10.0`。

**③ 权威依据**（go.dev 官方）：`doc/faq`「statically-linked binaries by default…include the Go runtime」；`doc/install/source#environment` 三平台均在有效组合内；`wiki/WindowsCrossCompiling`「cross-compiling of pure Go executables has become very easy」、cgo 仅在使用 cgo 时才需 C 交叉编译器。

**④ skill 带二进制是否合规**：官方 spec（`agentskills.io/skill-creation/using-scripts`）只讲源码脚本 + 内联依赖，**未提二进制，属文档空白（非禁止）**；生态已有范式：`contentful/skills` 的 skill-authoring 明文允许 compiled binaries 并定义 `scripts/` 薄包装 + `bin/` 编译产物；另有 `stock-tracker-skill`（bin/ 入库）、`osv-schema-skills`（Go CLI + skill bundle）等实例。

**⑤ 本地 HTML 直调二进制**：不可行，与语言无关 —— 浏览器无「启动本机程序」API，且 `file://` 下 `fetch` 被 CORS 拦（origin 为 `null`）。要本地 HTML 拿数据只能起本地 HTTP 服务或走浏览器扩展。

**踩坑**：`write_to_file` 首写临时 `main.go` 落成 0 字节（工具报成功、实际为空），重写后正常 —— 写文件后要 `wc -c` 复核再编译。

## 结论

三个问题均「可行」，且已知量级：**单命令 178 ms → 约 1-2 ms（含进程创建）；看板一次刷新 1.18 s → 几十毫秒**。用户零安装成本、零运行时依赖（Mac/Linux/Windows 三平台依赖面均已实测或文档背书）。未评估项：迁移工作量、数据格式兼容风险（须逐字节兼容老台账）、Windows 是否发（当前建议不发，锁代码未真机验）。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-27 05:54:11 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务
- 2026-10-27 06:26:51 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 认领 → doing
- 2026-10-27 06:27:16 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 调研结论已附到背景/过程/结论：三问均可行（178ms→1-2ms），落地转 0624 任务
