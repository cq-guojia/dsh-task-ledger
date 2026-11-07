# npm 信任发布（OIDC）链路

| 项 | 值 |
|---|---|
| 用途 | 发版打 tag 后由 GitHub Actions 自动分发两个包 |
| 适用版本 | 本仓 `.github/workflows/publish.yml`；npm ≥ 11.5.1（Node 24） |
| 版本真源 | 本仓 `.github/workflows/publish.yml` 与各包 `package.json`；npm Trusted Publisher 配置 |
| 复核日期 | 2026-10-27 |

## 一、结论

推 `plugin-v*` / `skill-v*` tag → GitHub Actions OIDC 信任发布（`npm publish --provenance`，无需 `NPM_TOKEN`）。**每个要发的包 `package.json` 都必须有匹配的 `repository.url`**，否则 provenance 校验 E422。`repository.url` 为空时 provenance 会签名上透明日志、挂在最后一步校验失败。

版本号以 git tag 为准：CI 从 `GITHUB_REF_NAME` 解析版本号写进 `package.json`（skill 另写 `SKILL.md` 头部那一行），tag 叫什么就发什么，不靠手工对齐两份版本号。修复后必须让 tag 指向含修复的新 commit，不能靠 re-run 旧 commit。

## 二、逐条事实与出处

| 事实 | 证据 | 出处 |
|---|---|---|
| 触发与权限 | `on.push.tags: ['skill-v*', 'plugin-v*']`；`permissions: id-token: write`（OIDC 信任发布必需） | `.github/workflows/publish.yml` |
| Node 版本要求 | `node-version: '24'`，注释：*"必须 npm 11.5.1+，否则无 OIDC 支持 → 404"* | 同文件 `:25` |
| 发布命令 | `npm publish --provenance`（Trusted Publisher 只勾 Allow npm publish，无需 token） | 同文件 `:31` |
| 版本取自 tag | 「版本号取自 tag」步：解析 `GITHUB_REF_NAME`，写回两个包的 `package.json` 与 skill 的 `SKILL.md` 头部 | 同文件 |
| 安装通道 | `dsh plugin add` 走 pnpm；npm / git 均可装；git 装时 prepare 脚本构建（pnpm `allowBuilds` 需放行） | 同文件 plugin job |
| monorepo 现状 | pnpm workspace 两包；插件 `dist/` 已入仓（git 直装、装完即用），CI 不重构建，直接发布仓库内产物 | 同文件 plugin job |
| 版本线陷阱 | `@deepseek-ai/*` 的 npm `latest` tag 可能指向旧版，须按 dsh 版本线取包 | 同栈仓 `dsh-capabilities.md`「npm 版本线」条 |

## 三、发版约束

两包独立 semver，按 tag 前缀分别触发：改了 `packages/skill/` 时 `skill-v*` 与 `plugin-v*` 都要升；只改插件控制页 / 操作页逻辑时只升 `plugin-v*`。本地不手工执行 `npm publish`，发版只由 tag 触发 CI。

## 四、复核方式

宿主 / CI 的 Node 或 npm 版本升级后，打开 `.github/workflows/publish.yml` 核对触发前缀、`id-token` 权限、Node 版本与发布命令，并确认两个包的 `repository.url` 仍与仓库地址一致。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
