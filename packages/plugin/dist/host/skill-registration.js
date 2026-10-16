/**
 * 内嵌 skill 的注册体组装（任务 2「skill 注册最小闭环」）。
 * 宿主事实（0.2.0-rc.2 npm pack 亲验）：external/dsh-skill-registration.md。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/** 内嵌 skill 目录：dist/host/skill-registration.js → 包根 skill/（copy-skill 产物）。 */
const SKILL_DIR = fileURLToPath(new URL('../../skill', import.meta.url));
/** SKILL.md 里指示脚本位置的占位符（注册时替换为绝对路径，模型据此找到脚本）。 */
const SKILL_DIR_TOKEN = '<本 SKILL.md 所在目录>';
/** frontmatter 最小解析：只取 name / description（不引 YAML 库；值去首尾引号）。 */
function parseFrontmatter(text) {
    const match = /^---\n([\s\S]*?)\n---/.exec(text);
    if (match === null)
        throw new Error('SKILL.md 缺 frontmatter（--- 包裹的头）');
    const field = (key) => {
        const line = (match[1] ?? '').split('\n').find((item) => item.startsWith(`${key}:`));
        if (line === undefined)
            throw new Error(`SKILL.md frontmatter 缺 ${key}`);
        return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
    };
    return { name: field('name'), description: field('description') };
}
/**
 * 组装注册体：读内嵌 SKILL.md → 取 name / description → 正文里的脚本路径占位符
 * 替换为绝对路径。
 *
 * 相对资源解析的二选一（external/dsh-skill-registration.md §三）**未拍板**；
 * 最小闭环选「插值绝对路径」——resourceBase 的消费者呈现未验证，不押注。
 * 拍板后如改走 resourceBase，只动本函数，调用方无感。
 */
export function buildSkillRegistration(skillDir = SKILL_DIR) {
    const text = readFileSync(`${skillDir}/SKILL.md`, 'utf-8');
    const { name, description } = parseFrontmatter(text);
    const content = text.split(SKILL_DIR_TOKEN).join(skillDir);
    if (content.includes(SKILL_DIR_TOKEN)) {
        throw new Error('占位符替换失败：SKILL.md 里仍残留脚本路径占位符');
    }
    if (!content.includes(`${skillDir}/scripts/progress.py`)) {
        throw new Error('占位符替换异常：替换后找不到脚本路径');
    }
    return { name, description, content, path: `${skillDir}/SKILL.md` };
}
