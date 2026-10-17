/**
 * 后端方法共享类型。
 * 宿主能力（workspaceRegistry / webServer 等）的结构面在 index.ts 与 routes.ts 本地声明——
 * 不 import 官方包（参考插件同款纪律：宿主 rc 接口会无声变，结构化声明 + external/ 文档坐标
 * 比绑死官方类型更稳）。
 */

/** 一个活跃台账工作区：宿主 registry 条目 + 本地探测（ledger/progress.json 存在）。 */
export interface LedgerWorkspace {
  /** 宿主工作区 id。 */
  readonly id: string
  /** 宿主 title（允许重名）。 */
  readonly title: string
  /** canonical 绝对路径（宿主已 realpath 归一；skill 脚本 --repo 直传它）。 */
  readonly path: string
}

/** progress.json 任务对象的原始字段（skill 脚本 list --json 的值形状；缺字段按可选处理）。 */
export interface TaskRecord {
  title?: string
  status?: string
  creator?: string | null
  owner?: string | null
  created?: string | null
  started?: string | null
  finished?: string | null
  category?: string | null
  tags?: string[] | null
  worklog?: string | null
}

/** 一条在办任务 = 原始字段 + 任务号 + 归属工作区（读取时打上）。 */
export interface TaskRow extends TaskRecord {
  readonly id: string
  readonly workspace: LedgerWorkspace
}

/** history 一条已结案记录（脚本 history --json 的 record 形状；字段名以脚本为准）。 */
export interface HistoryRecord {
  /** 结案时间（首列）。 */
  time?: string
  created?: string | null
  workpackage?: string
  category?: string | null
  tags?: string[] | null
  owner?: string
  /** 发起人（creator）：任务的「创建者」，与 owner 区分（owner 可被 claim 改走）。历史 9 列新增；旧 8 列由 skill 回链 worklog 头部补。 */
  creator?: string | null
  /** 「完成了什么」列。 */
  summary?: string
  /** 过程文档链接列。 */
  log?: string | null
  /** 行所在历史文件（相对工作区，脚本打上）。 */
  src?: string
  /** 归属工作区（读取时打上）。 */
  readonly workspace?: LedgerWorkspace
}

/** list / history 共用的过滤面（与 skill 脚本参数一一对应）。 */
export interface LedgerFilter {
  /** 状态（open/doing/blocked；history 侧忽略）。 */
  status?: string
  owner?: string
  category?: string
  tag?: string
  /** 创建时间起 / 止（YYYY-MM-DD [HH:mm[:ss]]，脚本会补全）。 */
  since?: string
  until?: string
  /** 列表分页大小（history 侧；script 的 --limit 在过滤 + 倒序后取前 N）。 */
  limit?: number
  /** 只读最近 N 个月的历史文件（插件传 13；不传 = 脚本默认读全部）。 */
  months?: number
}
