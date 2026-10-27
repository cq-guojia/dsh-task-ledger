// 构建步骤：把 packages/skill 真源拷入本包 skill/（内嵌副本与独立包同源，architecture 不变量 2）。
// 随 tsc 之后跑：npm run build = tsc && node scripts/copy-skill.mjs。
import { chmod, cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const skillSrc = path.resolve(pluginRoot, "../skill");
const skillDst = path.join(pluginRoot, "skill");

// 测试是开发产物，不进分发副本（check-skill-copy.mjs 同步排除这一目录）
const skipTests = (src) => path.resolve(src) !== path.join(skillSrc, "tests");

await rm(skillDst, { recursive: true, force: true });
await cp(skillSrc, skillDst, { recursive: true, filter: skipTests });

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

console.log("[copy-skill] packages/skill → packages/plugin/skill");
