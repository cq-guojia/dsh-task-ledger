/** 恢复默认的唯一参照：用户保存的值另存，写入不覆盖它。 */
export declare const DEFAULT_RULES_TEXT = "\u51E1\u4EFB\u52A1\u8FDB\u5EA6\u3001\u5DE5\u4F5C\u4E8B\u9879\u4E0E\u5DE5\u4F5C\u65E5\u5FD7\uFF08\u65B0\u5EFA / \u63A8\u8FDB / \u67E5\u8BE2 / \u7ED3\u6848\uFF09\u4E00\u5F8B\u8C03\u7528 task-ledger skill \u7BA1\u7406\uFF1B\u8FDB\u5EA6 / \u5386\u53F2\u7C7B\u95EE\u9898\u4E00\u5F8B\u8D70\u5B83\u4F5C\u7B54\uFF0C\u4E0D\u51ED\u5BF9\u8BDD\u8BB0\u5FC6\u6216\u81EA\u5EFA\u6E05\u5355\u9876\u66FF\u3002\u7528\u6237\u660E\u786E\u8BF4\u8981\u65B0\u5EFA\uFF08\u5982\u300C\u5F00\u4E2A\u65B0\u5751\u300D\u300C\u5EFA\u4E2A\u4EFB\u52A1\u300D\uFF09\u624D\u767B\u8BB0\uFF1B\u63D0\u95EE / \u67E5\u8BE2 / \u8BA8\u8BBA / \u987A\u624B\u5C0F\u6539\u4E0D\u7B97\u3002";
export interface RulesInjectionView {
    readonly enabled: boolean;
    /** 当前生效文案（用户值或默认值）。 */
    readonly text: string;
    readonly defaultText: string;
}
export interface WriteSettingsInput {
    readonly enabled?: boolean;
    readonly text?: string;
    readonly reset?: boolean;
}
/** 文件不存在或坏掉都按默认处理，不覆盖磁盘。 */
export declare function readSettings(): RulesInjectionView;
/** 原子替换写盘；恢复默认只清用户值，不动写死的常量。 */
export declare function writeSettings(input: WriteSettingsInput): RulesInjectionView;
type Listener = (...args: never[]) => unknown;
export interface InjectionContext {
    on(event: string, listener: Listener): unknown;
}
/** 注册 pre-step 监听；开关关时不注入，注入链路出错只记日志、不中断会话。 */
export declare function installRulesInjection(ctx: InjectionContext): void;
export {};
