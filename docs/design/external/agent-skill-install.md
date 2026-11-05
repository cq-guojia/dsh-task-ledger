# 各 agent 的 skill 安装位置（SKILL.md 生态）

> **类型**：🌐 **外部事实** —— 记的是各家 agent 客户端自己的扫描目录，不是本项目的设计
> **适用版本**：各客户端截至 2026-11-05 的公开文档 / 官方社区帖；客户端改版后按下方「复核方式」重查
> **状态**：✅ 已核实（2026-11-05 联网查证；证据强度逐行标注）
> **来源**：各行「出处」列，均为客户端官方文档、官方博客 / 官方社区，或社区实测对照件

## 一、结论

本 skill 是一个含 `SKILL.md` 的普通目录，**安装 = 把目录复制到目标 agent 扫描的位置**，无构建、无运行时依赖。

- **用户级**（对所有项目生效）与**项目级**（仅单仓库生效、可随仓库提交）两级并存；项目级是团队共用同一份 skill 的方式。
- **豆包工作是例外**：未公开用户级技能目录，只能走应用内「技能」面板导入。
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
| 通用安装器 `npx skills add <owner>/<repo>` 会扫描仓库内的 `SKILL.md` 并按所选 agent 落位；默认装到当前项目，`-g` 为全局 | <https://www.skills.sh/docs/cli>；<https://github.com/vercel-labs/skills> |
| 该安装器的 monorepo 内多份同内容副本会各自成为一个条目（同名），选择时需人工指定 | 同上（发现规则未在文档中展开，按仓库目录结构推断，未实测） |
| Windows 下用户级目录即 `%USERPROFILE%\<同上>` | 各出处命令示例一致 |

## 三、对本项目的落地含义

- `packages/skill/README.md` 与 `packages/skill/README.zh-CN.md` 的安装表按上表逐行给出命令；根 `README.md` 同表。
- 只写「复制目录」这一条路径，不写需要额外依赖或宿主私有 API 的安装方式。
- 豆包工作只写应用内导入，不写猜测出的目录。

## 四、复核方式

1. 客户端大版本升级后，打开上表「出处」列的官方文档页，逐行核对目录是否仍成立。
2. 官方文档未覆盖的（Codex / WorkBuddy / Trae / 豆包工作），以官方社区帖或客户端设置页自述为准；仍无权威来源的条目降级为「无公开目录」。
3. 复核结果直接改本表，并在「状态」行更新日期。
