# npm 信任发布（OIDC）链路

> **类型**：🌐 **外部事实** —— 含已实测的本仓发布链路结论
> **适用版本**：本仓 `.github/workflows/publish.yml`（2026-10-16 现状）；npm ≥ 11.5.1（Node 24）
> **状态**：✅ 已核实 + 端到端实测（2026-10-16：v0.0.2 失败 → v0.0.3 成功，`latest` 指向 0.0.3）
> **来源**：本仓 `.github/workflows/publish.yml`；NAS-Docker 台账调研任务过程记录（2026-10-16）

## 一、结论

推 `v*` tag → GitHub Actions OIDC 信任发布（`npm publish --provenance`，无需 token）。**每个要发的包 `package.json` 都必须有匹配的 `repository.url`**，否则 provenance 校验 E422。

## 二、逐条事实与出处

| 事实 | 证据 | 出处 |
|---|---|---|
| 触发与权限 | `on.push.tags: ['skill-v*', 'plugin-v*']`；`permissions: id-token: write`（OIDC 信任发布必需） | `.github/workflows/publish.yml` |
| Node 版本要求 | `node-version: '24'`，注释：*"必须 npm 11.5.1+，否则无 OIDC 支持 → 404"* | 同文件 `:25` |
| 发布命令 | `npm publish --provenance`（Trusted Publisher 只勾 Allow npm publish，无需 NPM_TOKEN） | 同文件 `:31` |
| **版本以 git tag 为准** | 2026-10-27 起：CI 从 `GITHUB_REF_NAME` 解析版本号写进 `package.json`（skill 另写 SKILL.md 头部那一行），tag 叫什么就发什么——不再靠人肉对齐两份版本号，也就不会再出现「tag 与包版本对不上 → npm 撞车」 | 同文件「版本号取自 tag」步 |
| provenance E422 | v0.0.2 失败：package.json `repository.url` 为空，与 provenance 仓信息不匹配（provenance 实际已签名上透明日志，挂在最后校验）；补 `repository` 字段后 v0.0.3 成功 | 调研过程记录（2026-10-16） |
| re-run 复用旧 commit | 修复后必须让 tag 指向含修复的新 commit，不能靠 re-run 旧 commit | 同上 |
| 安装通道 | `dsh plugin add` 走 pnpm；npm / git 均可装；git 装时 prepare 脚本构建（pnpm allowBuilds 需放行） | 同上 |
| monorepo 现状 | pnpm workspaces 两包；插件的 `dist/` 已入仓（DSH 生态：git 直装、装完即用），CI 不重构建，直接发布仓库内产物 | 同文件 plugin job |
| 版本线陷阱 | `@deepseek-ai/*` 的 npm `latest` tag 可能指向旧版，须按 dsh 版本线取包 | 姊妹仓 `dsh-capabilities.md`「npm 版本线」条 |

## 三、双包发布节奏（规划）

两包独立 semver，按 tag 前缀分别触发：`plugin-v*` / `skill-v*`（已按 `.github/workflows/publish.yml` 拆分触发，非旧 `v*` 单包）。
