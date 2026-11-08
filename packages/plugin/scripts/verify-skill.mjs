// 宿主 register() 不补 source 默认值，get() 加载时才校验 ⇒ 缺字段要到模型调用 skill 才炸
// （真源：docs/dependencies/dsh-skill-registration.md）。放进 verify，构建后拦住回归。
import { buildSkillRegistration } from "../dist/host/skill/registration.js";

const skill = buildSkillRegistration();
const checks = [
	["name 是 kebab-case", /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)],
	[
		"description 是非空字符串",
		typeof skill.description === "string" && skill.description.length > 0,
	],
	["source 是字符串", typeof skill.source === "string"],
	[
		"content 是非空字符串",
		typeof skill.content === "string" && skill.content.length > 0,
	],
	[
		"path 若给则是字符串",
		skill.path === undefined || typeof skill.path === "string",
	],
];

for (const [label, ok] of checks) {
	console.log(`[verify-skill] ${ok ? "PASS" : "FAIL"} ${label}`);
}
const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
if (failed.length > 0) {
	console.error(
		`[verify-skill] 注册体不符合宿主加载期契约：${failed.join("、")}`,
	);
	process.exit(1);
}
console.log(
	`[verify-skill] ${skill.name} 符合宿主加载期契约（source=${skill.source}）`,
);
