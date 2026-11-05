/**
 * `@deepseek-ai/schemastery` 的本地最小类型声明（server 侧声明 Config schema 用）。
 *
 * 官方 schema 库由宿主（profile 的 node_modules）解析，本仓不装 ⇒ 与
 * `client/primitives.d.ts` 同款做法：只复述要消费的那一面。
 * 事实来源：`dsh-plugin-core/packages/demo/src/schemastery.d.ts`（同栈活样本）+
 * `dsh-session-title-pattern/src/host/index.ts` 的 `Config` 写法（2026-11-05 对照）。
 */
declare module "@deepseek-ai/schemastery" {
	/** 一个已解析出来的 schema 节点。 */
	export interface Schema<T> {
		/** 缺省值：宿主解析缺失配置时补它。 */
		default(value: T): Schema<T>;
		/** 标记字段热更新；**同时决定它进不进设置表单**（非 volatile 字段既不可见也不可写）。 */
		volatile(): Schema<T>;
	}

	/** 取出一个 schema 节点的推导类型。 */
	export type Infer<S> = S extends Schema<infer T> ? T : never;

	export interface SchemaFactory {
		object<D extends Record<string, unknown>>(dict: D): Schema<{
			[K in keyof D]: Infer<D[K]>;
		}>;
		string(): Schema<string>;
	}

	const z: SchemaFactory;
	export default z;
}
