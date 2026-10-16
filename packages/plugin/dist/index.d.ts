export declare const name = "dsh-task-ledger";
/** 浏览器 / 宿主插件上下文的最小面（结构声明，不 import 官方包）。 */
interface PluginContext {
    inject(deps: readonly string[], callback: (ctx: Record<string, unknown>) => void): void;
}
export declare function apply(ctx: PluginContext): void;
export {};
