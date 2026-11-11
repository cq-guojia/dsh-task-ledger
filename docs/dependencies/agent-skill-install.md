# 各 agent 的 skill 安装位置（SKILL.md 生态）

| 项 | 值 |
|---|---|
| 用途 | 给其他 agent 装 `task-ledger` skill 时，确定该把目录复制到哪 |
| 适用版本 | 各客户端当前公开文档 / 官方社区帖；客户端改版后重查 |
| 版本真源 | 各行「出处」列的官方文档、官方博客 / 社区，或社区实测对照件 |
| 复核日期 | 2026-11-05 |

## 一、结论

本 skill 是一个含 `SKILL.md` 的普通目录，**安装 = 把目录复制到目标 agent 扫描的位置**，无构建、无运行时依赖。

- 用户级（对所有项目生效）与项目级（仅单仓库生效、可随仓库提交）两级并存；项目级是团队共用同一份 skill 的方式。
- 豆包工作是例外：未公开用户级技能目录，只能走应用内「技能」面板导入。
- 仓库内 `packages/skill/`（源）与 `packages/plugin/skill/`（随插件分发的副本）内容一致，装任一份皆可；两份同名会让按目录扫描的工具列出两个同名项。

## 二、逐条事实与出处

| 客户端 | 用户级目录 | 项目级目录 | 证据强度 | 出处 |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | 官方文档 | <https://code.claude.com/docs/en/skills> |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/`、`.agents/skills/` | 官方帮助页（转引）+ 社区实测 | <https://cursor.com/help/customization/skills>；<https://www.cubic.dev/blog/cursor-skills> |
| Codex CLI | `~/.codex/skills/`（`$CODEX_HOME/skills`） | `.agents/skills/` | 社区实测（多源一致） | <https://bytenote.net/article/codex-skills-path-and-upgrade>；<https://github.com/shanraisshan/codex-cli-best-practice/blob/main/docs/SKILLS.md> |
| CodeBuddy | `~/.codebuddy/skills/` | `.codebuddy/skills/` | 官方博客 + 社区实测 | <https://www.codebuddy.cn/blog/8>；<https://skillry.dev/skills/agent/codebuddy> |
| WorkBuddy | `~/.workbuddy/skills/` | —（未见公开项目级约定） | 官方社区（腾讯云开发者社区） | <https://cloud.tencent.cn/developer/article/2738234>；<https://www.claudepluginhub.com/marketplaces/owo1009-lll-edu-research-skills> |
| Trae | `~/.trae/skills/`；Trae CN：`~/.trae-cn/skills/` | `.trae/skills/` | 官方社区论坛 + 实测帖 | <http://forum.trae.cn/t/topic/7060/3>；<https://skillry.dev/skills/agent/trae> |
| 豆包工作（Doubao Work） | **无公开的用户级目录** | — | 两处独立来源一致：目录未公开，勿臆造 | <https://bibigpt.co/agent>（明示「没有公开的隐藏目录」）；安装入口见应用内「技能」面板 |

补充事实：

| 事实 | 出处 |
|---|---|
| 通用安装器 `npx skills add <owner>/<repo>` 会扫描仓库内的 `SKILL.md` 并按所选 agent 落位；默认装到当前项目，`-g` 为全局，`--agent` 限定目标、`--skill` 限定条目 | <https://www.npmjs.com/package/skills>；<https://www.skills.sh/docs/cli> |
| 该安装器支持三种来源：`owner/repo`、完整 GitHub URL、**仓库内某个技能的直接路径**（`https://github.com/<owner>/<repo>/tree/<branch>/<dir>`）—— monorepo 用第三种可绕开同名副本的歧义 | <https://www.npmjs.com/package/skills>（Source Formats 节） |
| 它有 `find` / `list` / `use` 子命令；`use` 可临时加载而不安装 | 同上 |
| SkillHub（<https://skillhub.cn>）是 CodeBuddy / WorkBuddy 背后的技能市场，带 CLI（`skillhub install`，默认落到当前目录 `skills/`）；上架需 `skillhub publish`。本项目未上架，故 README 只写「检索不到时走本地导入 / GitHub 来源」 | <https://skillhub.cn/install/skillhub.md>；<https://github.com/totwo2/reskill/blob/master/HANDOVER.md> |
| SkillHub 桌面版（<https://github.com/VipBeCool/SkillHub>）可把本地文件夹、GitHub 仓库、在线链接作为来源统一管理 | 该项目 README |
| Windows 下用户级目录即 `%USERPROFILE%\<同上>` | 各出处命令示例一致 |

## 三、对本项目的落地含义

- 上表是各客户端目录的核实记录，不再搬进 README：`packages/skill/README.md`、`packages/skill/README.en.md` 与根 README 都只写安装动作，不列逐行目录表。
- 包 README 的安装只有一个章节、两条路径：`npx skills add cq-guojia/dsh-task-ledger -g` 或把一句提示词交给 Agent 自行安装。不写手动复制目录的步骤 —— 把仓库 clone 下来放进技能目录并不能直接运行，会误导读者。
- 应用内导入、项目级目录与 Windows 二进制等细节下沉到本表与 `SKILL.md`，包 README 不再展开。

## 四、复核方式

1. 客户端大版本升级后，打开上表「出处」列的官方文档页，逐行核对目录是否仍成立。
2. 官方文档未覆盖的（Codex / WorkBuddy / Trae / 豆包工作），以官方社区帖或客户端设置页自述为准；仍无权威来源的条目降级为「无公开目录」。
3. 复核结果直接改本表，并更新「复核日期」。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-11 17:18:16：包 README 不再列逐行目录表，安装以 skills CLI 与委托安装为主
- 2026-11-11 17:31:52：安装合并为单章节、删手动安装；更正落地含义
