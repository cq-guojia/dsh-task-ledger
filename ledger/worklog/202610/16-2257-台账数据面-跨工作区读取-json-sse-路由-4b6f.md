# 20261016-2257-台账数据面-跨工作区读取-json-sse-路由-4b6f: 台账数据面：跨工作区读取 + JSON/SSE 路由

- **Tags**: 建设, DSH, 数据面, 路由
- **Status**: done · 2026-10-16 23:38:00 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-10-16 22:57:42 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-10-16 23:38:00 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

看板首页的数据来源（原大任务拆出）。host 进程跨工作区读各 `ledger/` 文件，经
`ctx.webServer.register` 路由供 client 消费。宿主路由 / SSE 事实见
`docs/design/external/host-webserver.md`；数据格式见 `docs/design/ledger-data.md`。

## To Do

- 工作区根路径枚举与配置（配置形态**待拍板**，architecture §五）；
- JSON 路由：在办聚合（多工作区 `progress.json`）+ history 解析（8 列，首列结案时间）+ worklog 读取；
- SSE 变更推送（浮标角标计数与列表刷新共用一条通道）；
- 路由鉴权：默认回环；非回环部署方案**待拍板**（architecture §五）。

## Next

本任务为 open，谁做谁 `claim`。认领后从「待办」第一项推进；依赖任务「插件工程化与
skill 注册最小闭环」先就位（路由挂在同一个 host 半里）。

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

## Conclusion

<!-- What got done, what got left behind -->

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id <id> --note "...". -->
