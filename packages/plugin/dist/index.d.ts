export declare const name = "dsh-task-ledger";
/**
 * 插件配置 schema —— 插件详情页配置区的唯一来源（dsh 0.1.7+：settings 服务按活跃
 * entry 的 `Config` 派生表单，命名空间 = `cordis.patch.yml` 那条 insert 的 id = 包名）。
 *
 * · 只有 `.volatile()` 字段会进表单，且由宿主**原位热更新 + 持久化**（写到 profile
 *   patch 文档）；插件不自己落盘、不碰 localStorage。
 * · `entryMode`：`first` = 左侧第一级（默认，= 既有位置）/ `more` = 「更多」菜单。
 * · `displayName`：空串 = 用词典里的默认名（见 client/locales.ts 的 `panelTitle`）。
 *
 * 刻意不带 `z<Config>` 类型标注：`.volatile()` 改变推导类型，带上反而 TS2322。
 */
export declare const Config: import("@deepseek-ai/schemastery").Schema<{
    entryMode: string;
    displayName: string;
}> | undefined;
/** 插件上下文的最小面（结构声明，不 import 官方包）。 */
interface PluginContext {
    inject(deps: readonly string[], callback: (ctx: Record<string, unknown>) => void): void;
    /** 组合内副作用：进入时 setup、离开时执行返回的清理函数（cordis 核心面）。 */
    effect(setup: () => (() => void) | undefined): void;
    /** 按名取服务（取不到给 undefined）。**读属性**在未 inject 的模块上会直接 throw ⇒ 见 serviceOf。 */
    get(name: string): unknown;
}
export declare function apply(ctx: PluginContext): void;
export {};
