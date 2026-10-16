export declare const name = "dsh-task-ledger";
/** 插件上下文的最小面（结构声明，不 import 官方包）。 */
interface PluginContext {
    inject(deps: readonly string[], callback: (ctx: Record<string, unknown>) => void): void;
    /** 组合内副作用：进入时 setup、离开时执行返回的清理函数（cordis 核心面）。 */
    effect(setup: () => (() => void) | undefined): void;
}
export declare function apply(ctx: PluginContext): void;
export {};
