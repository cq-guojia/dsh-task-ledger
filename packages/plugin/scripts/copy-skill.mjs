// 构建步骤：把 packages/skill 真源拷入本包 skill/（内嵌副本与独立包同源，architecture 不变量 2）。
// 随 tsc 之后跑：npm run build = tsc && node scripts/copy-skill.mjs。
import { cp, rm } from "node:fs/promises";
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
console.log("[copy-skill] packages/skill → packages/plugin/skill");
