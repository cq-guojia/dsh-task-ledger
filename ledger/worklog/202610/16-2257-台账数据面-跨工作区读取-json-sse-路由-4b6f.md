# 20261016-2257-台账数据面-跨工作区读取-json-sse-路由-4b6f：台账数据面：跨工作区读取 + JSON/SSE 路由

> **创建**：2026-10-16 22:57:42（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **状态**：closed · @GuoJia-Agent（8d557c6d-7c93-43ac-8c73-5d623e82e1c6） · 更新 2026-10-16 23:38:00
> ✅ 完成封卷：2026-10-16 23:38:00（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：建设 ｜ **标签**：DSH、数据面、路由

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

看板首页的数据来源（原大任务拆出）。host 进程跨工作区读各 `ledger/` 文件，经
`ctx.webServer.register` 路由供 client 消费。宿主路由 / SSE 事实见
`docs/design/external/host-webserver.md`；数据格式见 `docs/design/ledger-data.md`。

## 待办

- 工作区根路径枚举与配置（配置形态**待拍板**，architecture §五）；
- JSON 路由：在办聚合（多工作区 `progress.json`）+ history 解析（8 列，首列结案时间）+ worklog 读取；
- SSE 变更推送（浮标角标计数与列表刷新共用一条通道）；
- 路由鉴权：默认回环；非回环部署方案**待拍板**（architecture §五）。

## 下一步

本任务为 open，谁做谁 `claim`。认领后从「待办」第一项推进；依赖任务「插件工程化与
skill 注册最小闭环」先就位（路由挂在同一个 host 半里）。

## 过程

<!-- 踩坑、定位、证据。带 revision 和 文件:行号 或符号名（行号会漂移）。
     例：rc4f2a1 的 src/host.ts:112 返回 null，是因为没等 ready 事件就发了请求 -->

## 结论

<!-- 收尾时填：做成了什么、留了什么坑。
     例：已修复，但只覆盖 UTF-8；GBK 另开任务 -->

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
