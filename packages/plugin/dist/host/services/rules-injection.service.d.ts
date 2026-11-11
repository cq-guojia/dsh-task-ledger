export type RulesLang = "zh" | "en";
/** 恢复默认的唯一参照：中英各一份写死常量；用户保存的值另存，写入不覆盖它们。 */
export declare const DEFAULT_RULES_TEXT_ZH: string;
/** 英文与中文条目对齐，格式同为 `- **关键词**：…`；最后那句问话也要说英文（英文界面下出现中文原句是 bug）。 */
export declare const DEFAULT_RULES_TEXT_EN: string;
export interface RulesInjectionView {
    readonly enabled: boolean;
    /** 落盘的语言：注入按它挑默认文案。 */
    readonly lang: RulesLang;
    /** 当前生效文案（用户值或该语言默认值）。 */
    readonly text: string;
    readonly defaultText: string;
    /** 是否保存过用户自定义文案（设置页的小标识用它，不跟着草稿变）。 */
    readonly customized: boolean;
}
export interface WriteSettingsInput {
    readonly enabled?: boolean;
    readonly lang?: RulesLang;
    readonly text?: string;
    readonly reset?: boolean;
}
/** GET 与注入都走这里：按文件里落盘的 lang 返回。 */
export declare function readSettings(): RulesInjectionView;
/** 原子替换写盘；恢复默认或「内容与默认一致」都只清用户值，不动写死的常量。 */
export declare function writeSettings(input: WriteSettingsInput): RulesInjectionView;
type Listener = (...args: never[]) => unknown;
export interface InjectionContext {
    on(event: string, listener: Listener): unknown;
}
/** 注册 pre-step 监听；开关关时不注入，注入链路出错只记日志、不中断会话。 */
export declare function installRulesInjection(ctx: InjectionContext): void;
export {};
