// 构建步骤：把 packages/skill/package.json 的 version 注入 packages/skill/SKILL.md 的
// frontmatter `version:` 行，保证 skill 自带版本号与包版本一致，不再手写漏改。
//
// 接在 build:host 的 copy-skill.mjs 之前跑：源 SKILL.md 先对齐，再整目录拷进内嵌副本，
// 副本自动一致。版本真源只有 package.json 一处（docs/design/external/publish-oidc.md），
// DSH 宿主不读 SKILL.md 的 frontmatter version，这里只是为了展示不脱节。
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, "../../skill");
const pkgPath = path.join(skillRoot, "package.json");
const skillMdPath = path.join(skillRoot, "SKILL.md");

const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;
if (!version) {
	console.error(`✗ ${pkgPath} 没有 version 字段`);
	process.exit(1);
}

const text = readFileSync(skillMdPath, "utf8");
// 只替换 frontmatter 内「行首 version:」那一行（正文不会有行首 version:）。
const updated = text.replace(/^version: .*$/m, `version: ${version}`);
if (updated === text) {
	console.log(`[sync-skill-version] SKILL.md 已是 ${version}，无需改动`);
} else {
	writeFileSync(skillMdPath, updated);
	console.log(`[sync-skill-version] SKILL.md → version: ${version}`);
}
