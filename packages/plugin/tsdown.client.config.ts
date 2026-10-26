import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { defineConfig } from "tsdown";

/**
 * 浏览器端产物不是普通 ESM，而是 dsh 模块内核消费的 CJS 闭包工厂：
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * 因此 format 必须是 cjs，且要在产物外包上固定的 banner / footer / intro。
 * 契约与平台模块表同姊妹仓 `dsh-task-dispatch-table`（0.2.0-rc.2 真机在用）。
 */
const PLATFORM_MODULES = new Set([
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-store",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-ui-dockkit",
]);

const PACKAGE_NAME = "dsh-task-ledger";

/** 版本号 + 构建编码：构建期烤进 bundle，运行时直接读（对齐 dsh-plugin-core/demo 的 build.mjs 口径），
 *  判「宿主里跑的是不是刚 build 的」不用猜。编码用编译时刻时间戳（非随机数）：年月日-时分秒-毫秒。 */
const PLUGIN_VERSION = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version as string;
const BUILD_STAMP = (() => {
	const d = new Date();
	const p = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
})();

const isExternal = (specifier: string): boolean =>
	PLATFORM_MODULES.has(specifier);

export default defineConfig({
	// 产出固定为 dist/client.js（单文件）；dist 里同时有 host 侧 tsc 产物，故 clean 必须关。
	entry: { client: "src/client/index.ts" },
	outDir: "dist",
	format: "cjs",
	platform: "browser",
	target: "chrome99",
	// 被打进来的依赖（floating-ui 等）含 process.env.NODE_ENV 的开发期分支，浏览器无 process ⇒
	// 构建期定死 production，dev 警告分支变死代码一并消掉（否则激活时报 "process is not defined"）。
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
		__PLUGIN_VERSION__: JSON.stringify(PLUGIN_VERSION),
		__BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
	},
	dts: false,
	clean: false,
	sourcemap: true,
	deps: {
		// 平台模块保留为 require（内核模块表回答）；其余全部内联 —— 模块表回答不了的
		// require() 在运行时必然抛。
		neverBundle: isExternal,
		alwaysBundle: (specifier) =>
			!isBuiltin(specifier) && !isExternal(specifier),
	},
	outputOptions: {
		entryFileNames: "client.js",
		banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
		footer: "return module.exports; } });",
		intro: "var module = { exports: {} }; var exports = module.exports;",
	},
});
