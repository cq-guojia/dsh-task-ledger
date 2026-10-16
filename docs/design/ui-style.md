# 样式规范（初始）

> **状态**：📝 初建（2026-10-16；两条硬约束已核实，其余待落码时补）
> **来源**：姊妹仓 `dsh-task-dispatch-table` 已核实事实（0.2.0-rc.2）+ 本仓 [`external/client-ui-layout.md`](external/client-ui-layout.md)
> **配套**：外部事实详见 [`external/client-ui-layout.md`](external/client-ui-layout.md)

## 一、两条硬约束（违反即出 bug）

1. **明暗判据只认宿主**：`body[data-ds-dark-theme]`；插件**禁用** `prefers-color-scheme`（它跟操作系统、不跟用户在宿主里的选择，两者不一致时会把暗色的浅 / 白字套在宿主浅色面板上 ⇒ 白字白底隐形）。跟随宿主切主题用 `MutationObserver`（宿主是 `toggleAttribute` 写该属性），挂载时先同步一次。
2. **用宿主设计变量，不自定 px 刻度**：色 / 圆角 / 字号 / 阴影一律走 `--dsw-*` token（详见外部事实文档）；界面蓝色强调用 `--dsw-alias-state-business-primary` —— **不是** `--dsw-alias-brand-primary`（明色近黑、暗色近白，不是蓝）。

## 二、无表格件（已知缺口）

宿主 primitives **没有 Table / DataGrid / List / 排序 / 分页 / 虚拟滚动件**；最接近的行件是 `DisclosureRow`，状态件 `StateDot`，文件类型图标 `FileTypeIcon`，约 370 个 `Icon*`。台账看板的列表行按官方 token 与几何自绘（待设计）。
