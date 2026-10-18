/** 宿主 ctx.skills.register 的最小面（外部事实文档的结构面）。 */
export interface SkillRegistration {
    name: string;
    description: string;
    content: string;
    whenToUse?: string;
    path?: string;
    source?: string;
    resourceBase?: {
        kind: 'directory';
        path: string;
    };
    metadata?: Record<string, unknown>;
}
/** 宿主 skills 服务的最小面。 */
export interface SkillsRegistry {
    register(skill: SkillRegistration): () => void;
}
/**
 * 组装注册体：读内嵌 SKILL.md → 取 name / description → 正文里的脚本路径占位符
 * 替换为绝对路径。
 *
 * 相对资源解析的二选一（external/dsh-skill-registration.md §三）**未拍板**；
 * 最小闭环选「插值绝对路径」——resourceBase 的消费者呈现未验证，不押注。
 * 拍板后如改走 resourceBase，只动本函数，调用方无感。
 */
export declare function buildSkillRegistration(skillDir?: string): SkillRegistration;
