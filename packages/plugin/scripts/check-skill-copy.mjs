// 内嵌 skill 副本一致性：build:host 里的 copy-skill.mjs 把 packages/skill 整目录拷进
// packages/plugin/skill。忘了 build 就会「源改了、发出去的还是旧的」——这个仓库的产物
// 是入库的，所以这一步必须在提交前能查。
//
// 跑法：node scripts/check-skill-copy.mjs（CI 在 build 之前跑；本地可随时跑）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(here, "../../skill");
export const DST_ROOT = path.resolve(here, "../skill");

function walk(dir, base = dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		// 运行脚本产生的字节码缓存不属于分发内容，不参与比较
		if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) return [];
		const abs = path.join(dir, entry.name);
		return entry.isDirectory()
			? walk(abs, base)
			: [path.relative(base, abs).split(path.sep).join("/")];
	});
}

/** 比较源与副本；返回三组差异（都为空才算一致）。 */
export function diffSkillCopy() {
	const srcFiles = walk(SRC_ROOT).sort();
	const dstFiles = fs.existsSync(DST_ROOT) ? walk(DST_ROOT).sort() : [];
	const srcSet = new Set(srcFiles);
	const dstSet = new Set(dstFiles);
	return {
		missing: srcFiles.filter((rel) => !dstSet.has(rel)),
		extra: dstFiles.filter((rel) => !srcSet.has(rel)),
		differing: srcFiles.filter((rel) => {
			if (!dstSet.has(rel)) return false;
			return !fs
				.readFileSync(path.join(SRC_ROOT, rel))
				.equals(fs.readFileSync(path.join(DST_ROOT, rel)));
		}),
	};
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const { missing, extra, differing } = diffSkillCopy();
	const problems = [
		...missing.map((rel) => `副本缺文件：${rel}`),
		...extra.map((rel) => `副本多出文件：${rel}`),
		...differing.map((rel) => `内容不一致：${rel}`),
	];
	if (problems.length > 0) {
		console.error(
			"✗ 内嵌 skill 副本与 packages/skill 不一致，先跑 npm run build:host：",
		);
		for (const p of problems) console.error(`  ${p}`);
		process.exitCode = 1;
	} else {
		console.log("✓ 内嵌 skill 副本与源一致");
	}
}
