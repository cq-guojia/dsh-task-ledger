// 构建前清 host 侧旧产物：tsc 不删 outDir 里的陈旧文件，重命名/搬移后会留残骸
// （残骸会被冒烟的结构断言抓到，但每次手工删容易漏 ⇒ 收进 build:host 第一步）。
// 只清 dist/host 与 dist/skill（tsc / copy-skill 各自重建）；dist/client.js 是 tsdown 产物，不清。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../dist",
);

for (const name of ["host", "skill"]) {
	fs.rmSync(path.join(dist, name), { recursive: true, force: true });
}
