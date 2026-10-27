// 构建步骤：把 packages/skill 的**运行时**拷进本包 skill/（插件自带一份 skill，architecture 不变量 2）。
// 随 tsc 之后跑：npm run build:host = clean-dist → tsc → sync-skill-version → copy-skill。
//
// 只同步运行时那几项：源码（src/）留在 packages/skill 原地，不进分发副本；
// 这样「插件里那份 skill」与「仓库里的 skill 源码」不会各留一份，副本是纯产物。
import { chmod, cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const skillSrc = path.resolve(pluginRoot, "../skill");
const skillDst = path.join(pluginRoot, "skill");

// 运行时清单：白名单，新增运行时项时在这里加一行（check-skill-copy.mjs 同款）。
export const RUNTIME_ENTRIES = [
	"SKILL.md",
	"README.md",
	"package.json",
	"assets",
	"references",
	"scripts",
];

// 这个模块被 check-skill-copy.mjs 引来取 RUNTIME_ENTRIES，import 时不能顺手拷一遍：
// 只有「作为脚本直接跑」才执行拷贝。
const isMain =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	await rm(skillDst, { recursive: true, force: true });
	await mkdir(skillDst, { recursive: true });
	for (const entry of RUNTIME_ENTRIES) {
		await cp(path.join(skillSrc, entry), path.join(skillDst, entry), {
			recursive: true,
		});
	}

	// 可执行位不能指望各种拷贝 / 打包环节都保住：丢了的表现是运行期「起不了台账程序」，
	// 而不是构建期报错。所以每次构建统一补齐——入口 shim + 各平台二进制。
	const binDir = path.join(skillDst, "scripts", "bin");
	const executables = [path.join(skillDst, "scripts", "progress")];
	for (const name of await readdir(binDir).catch(() => [])) {
		if (name.startsWith("ledger-")) executables.push(path.join(binDir, name));
	}
	for (const file of executables) {
		await chmod(file, 0o755).catch(() => {});
	}

	console.log("[copy-skill] packages/skill → packages/plugin/skill（运行时）");
}
