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

设置页首屏是三步流程引导：① 安装 Skill（宿主插件已自带，这里只给其他 agent 的安装入口）；② 工作区操作（新建 / 执行 / 结束的说法）；③ 面板查询（在办 / 历史 / 设置）。

三格徽标 = 核心 `IconButton`（`plain`、`lg` 32 方，圆角走核心 `--dshpc-radius-md`，本插件只换底色与前景色）+ 核心字体图标（`dsh-plugin-core/ui/icons`，`common.base:xiazai` / `gongzuoqu` / `shuju`，三格统一 16px ⇒ 每边留 8px；`size` 必须三格一致，22px 会顶满）。徽标之间的连接节点 = CSS 圆底（不透明 `color-mix`）+ 字体图标 `common.base:jiantou-you`（窄屏朝下时只转这颗箭头）。

安装那一段的三块内容面全部用核心控件，不自己写 `border` / `border-radius`：包名一行与命令一行用核心 `ListRow`（带边档；包名行整行可点打开 npm 页，两个图标钮在 `actions` 槽，点图标不连带整行；命令行只带复制钮、不设点击），提示词与规则片段两块用核心 `Surface` 的 `border: "dashed"` 档（圆角取核心 md=12；复制钮绝对定位钉在右上角，右侧内距让位，正文不压按钮）。

## 五、边界

- 设置页不写台账 JSON；所有写操作经 host 路由转同一个 skill 脚本。
- 只读部署下设置区整体只读，不给出可点的写按钮后报错。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-15：流程三格与安装段改走核心控件（图标走 `ui/icons`、三格 16px；命令行与包名行都用 `ListRow`，两块可复制正文用 `Surface` 的 dashed 档）
