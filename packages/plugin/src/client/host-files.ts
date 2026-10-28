/**
 * 宿主文件服务面：client 入口 `apply` 里接一次，供「查看」钮弹出的文件预览读盘用。
 *
 * DSH 插件跑在宿主沙箱里碰不到本地磁盘，文件一律走宿主 `remote.workspaceFiles`
 * （openFilePreview 靠它按 sessionId 读工作区文件）。同款接线见 dsh-plugin-core demo 的 host-files.ts。
 */
import { connectHost } from "dsh-plugin-core/ui";
import type { WorkspaceFilesFace } from "dsh-plugin-core/explorer";

/** 只用到 inject；与核心库 HostClientContext 同形，不引 index 避免循环依赖。 */
interface InjectCtx {
	inject(deps: readonly string[], callback: (sub: unknown) => void): void;
}

let hostFiles: WorkspaceFilesFace | null = null;

/** 预览调用时取当前宿主文件服务；未就位为 null（钮保持禁用，不造假）。 */
export function getHostFiles(): WorkspaceFilesFace | null {
	return hostFiles;
}

/** 入口 apply 调一次：接宿主工作区列表（connectHost，给 openFilePreview 自动解析 sessionId）
 *  与文件服务（remote.workspaceFiles）。 */
export function registerHostFiles(ctx: InjectCtx): void {
	connectHost(ctx);
	// dotted 注入键：只注 'remote' 会在命名空间刚挂上、workspaceFiles 还没挂时触发，
	// 此刻取到的永远是 undefined ⇒ 必须带 dotted 形式（dsh-plugin-core demo 同口径）。
	ctx.inject(["remote", "remote.workspaceFiles"], (sub: unknown) => {
		const s = sub as {
			remote?: { workspaceFiles?: WorkspaceFilesFace };
			workspaceFiles?: WorkspaceFilesFace;
		} | null;
		const found = s?.remote?.workspaceFiles ?? s?.workspaceFiles ?? null;
		if (found !== null && typeof found.list === "function") hostFiles = found;
	});
}
