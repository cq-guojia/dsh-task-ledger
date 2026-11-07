# 身份与设置页

## 一、身份闸门

进页面的第一件事是 `GET /identity`。本机未初始化时 `{uuid, name}` 双 null，界面整页切到身份页，后续快照请求不发；身份缺失是独立错误码 `LEDGER_IDENTITY_MISSING`，不降级成空身份。

花名册走 `GET /identity/roster`，按工作区列出 `@名字` 与 UUID；共享身份单列一档显示。

## 二、上半部：身份与名字

- 名字内联改名走 `switch --rename`，同时更新本机身份与每本台账的名册。
- 移除身份走 `POST /identity/forget`；切换身份走 `POST /identity/switch`。
- 身份表操作列只放改名与删除两个图标钮，不写表头文案。

## 三、下半部：台账目录

见 [ledger-dirs.md](ledger-dirs.md)。

## 四、安装 Skill 引导

设置页首屏是三步流程引导：① 安装 Skill（宿主插件已自带，这里只给其他 agent 的安装入口）；② 工作区操作（新建 / 执行 / 结束的说法）；③ 面板查询（在办 / 历史 / 设置）。包名那一行用核心 `ListRow`：包名在主内容，GitHub 与 npm 两个图标钮在 `actions` 槽，整行可点打开 npm 包页，点右侧图标不连带整行。

## 五、边界

- 设置页不写台账 JSON；所有写操作经 host 路由转同一个 skill 脚本。
- 只读部署下设置区整体只读，不给出可点的写按钮后报错。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
