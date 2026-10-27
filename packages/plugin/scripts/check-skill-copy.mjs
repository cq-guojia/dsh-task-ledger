// 内嵌 skill 副本一致性：build:host 里的 copy-skill.mjs 把 packages/skill 的运行时拷进
// packages/plugin/skill。忘了 build 就会「源改了、发出去的还是旧的」——这个仓库的产物
// 是入库的，所以这一步必须在提交前能查。
//
// 跑法：node scripts/check-skill-copy.mjs（CI 在 build 之前跑；本地可随时跑）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_ENTRIES } from "./copy-skill.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(here, "../../skill");
export const DST_ROOT = path.resolve(here, "../skill");

// 只比运行时那几项：源码在 packages/skill/src，不进副本（copy-skill.mjs 同款白名单）。
function walk(dir, base) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const abs = path.join(dir, entry.name);
		return entry.isDirectory()
			? walk(abs, base)
			: [path.relative(base, abs).split(path.sep).join("/")];
	});
}

function runtimeFiles(root) {
	return RUNTIME_ENTRIES.flatMap((entry) => {
		const abs = path.join(root, entry);
		if (!fs.existsSync(abs)) return [];
		if (!fs.statSync(abs).isDirectory()) return [entry];
		return walk(abs, root);
	}).sort();
}

/** 比较源与副本；返回三组差异（都为空才算一致）。 */
export function diffSkillCopy() {
	const srcFiles = runtimeFiles(SRC_ROOT);
	const dstFiles = fs.existsSync(DST_ROOT) ? runtimeFiles(DST_ROOT) : [];
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
