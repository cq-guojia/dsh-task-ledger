# 宿主 skill 注册接口（ctx.skills）

| 项 | 值 |
|---|---|
| 用途 | host 插件在 `apply` 里把内嵌 skill 注册进宿主全局 |
| 适用版本 | `@deepseek-ai/dsh-skill@0.2.2-rc.1`（宿主版本线；`0.2.0-rc.2` 的 `lib/index.js` 与本版字节一致） |
| 版本真源 | `@deepseek-ai/dsh-skill@0.2.2-rc.1` 解包产物 `lib/types/index.d.ts` + `lib/index.js` + `README.md` |
| 复核日期 | 2026-11-09 |

## 一、结论

「装插件即把 skill 带进 dsh 全局」可行：host 插件在 `apply` 里调 `ctx.skills.register(skill)` 注册一个内存态 skill；unscoped 注册落**全局层**，模型侧经 `dsh-tool-skill` 消费。注册体必须显式给出 `source`：`register()` 不给它填默认值，而加载期校验要求它是字符串，省略会导致「注册成功、加载失败」。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| 注册 API | `register(skill: SkillRegistration): () => void` —— 返回 Cordis effect disposer | `lib/types/index.d.ts:257` |
| 注册进调用 ctx 的层 | *"an unscoped context registers globally"*；host 行与仓库插件落全局层 | `lib/types/index.d.ts:218-222` |
| 必填字段 | `SkillSummary.source` 是必填 `readonly source: SkillSource`；`SkillRegistration = Omit<SkillDefinition,'invocation'\|'provider'> & { invocation?, provider? }` ⇒ 必填 `name`（kebab-case）+ `description` + `content` + `source`；可选 `whenToUse` / `path` / `resourceBase` / `metadata` / `invocation` / `provider` | `lib/types/index.d.ts:56`、`:79-84`、`:44-77` |
| source 取值 | `SkillSource = 'project-dsh' \| 'project-agents' \| 'runtime' \| 'user-dsh' \| 'user-agents' \| 'custom' \| 'bundled' \| (string & {})`；注释：*"The value is prompt-visible metadata, not precedence by itself"* | `lib/types/index.d.ts:23-24` |
| register 不补 source | `const definition = { ...skill, invocation: skill.invocation ?? {...}, provider: skill.provider ?? RUNTIME_PROVIDER }` ⇒ 只补 `invocation` 与 `provider`；写入前只跑 `validateRuntimeSkill`（不校验 source） | `lib/index.js:193-207`、`:465-468` |
| 加载期校验 | `get()` 取到 definition 后调 `validateDefinition`，其中 `if (typeof source !== "string") throw new TypeError(\`loaded skill "${name}" source must be a string\`)` | `lib/index.js:250-258`、`:470-489` |
| invocation 缺省双面可调 | *"omitted invocation and provider fields receive defaults"*；策略 = `modelInvocable` / `userInvocable`，缺省两者皆 true | `README.md` §Use this package；`lib/types/index.d.ts:37-42`、`:254` |
| provider 缺省 = runtime | *"omission uses the registry-owned runtime provider"*；`RUNTIME_PROVIDER = "runtime"` 是保留 provider 名，runtime 条目的 rank 固定 `RUNTIME_RANK = 250` | `README.md` §Use this package；`lib/index.js:20-21` |
| 同名 runtime first-wins | *"Same-name runtime entries in one layer are first-wins; a duplicate logs a warning and receives a no-op disposer so it cannot remove the winner"* | `lib/types/index.d.ts:250-253` |
| 层内优先级 | *"Project entries outrank runtime entries, which outrank user entries, within one layer"* | `lib/types/index.d.ts:249` |
| 名字校验 | `isSkillName(name)`：kebab-case 语法 | `lib/types/index.d.ts:22` |
| 资源基座 | `SkillResourceBase` = `{kind:'directory',path}` / `{kind:'url',url}` / `{kind:'opaque',description}`；注释：*"Optional provider-specific base used by loaded skill bodies to resolve relative resources"* | `lib/types/index.d.ts:26-35` |
| 模型侧渲染 | `renderSkillContent(skill)` 产出 `<skill_content>` 块（name 走转义属性、正文原样嵌入） | `lib/types/index.d.ts:143` |
| bundled 优先级 | `BUNDLED_SKILL_RANK = 600`（打包 provider 与本地 bundled root 的标准优先级） | `lib/types/index.d.ts:16` |
| 失效通知 | 注册 / dispose / provider invalidate 后发 `skills/change` 事件；registry 无 TTL，不推断远端变更 | `lib/types/index.d.ts:203-211`；`README.md` §Known Limitations |

## 三、对本插件的落地含义

1. 内嵌 skill 副本：插件构建时把 `packages/skill/` 的运行时（SKILL.md + scripts + assets + references）纳入产物，`apply` 时 `register({ name: 'task-ledger', description, content, source: 'runtime' })`；取 `'runtime'` 与缺省 provider 一致，且宿主注明 source 不参与优先级。正文里插值插件安装目录，保住 skill「`scripts/progress` 相对 SKILL.md 定位」的写法（另一条路是 `resourceBase: { kind: 'directory', path: <安装目录> }`，宿主原生机制，消费者如何呈现待验证）。
2. 卸载即失效：`register` 返回的 disposer 随插件 dispose 自动注销，无需额外清理。
3. 独立分发不依赖宿主：`task-ledger` 包零代码直发（SKILL.md + scripts + assets），其他 agent 按各自约定安装；与插件内嵌副本同源，见 [overview.md](../architecture/overview.md) 的不变量。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-skill dist-tags --json        # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-skill@<版本> && tar xzf *.tgz
# 看四处：注册体必填字段是否变（lib/types/index.d.ts，尤其 source 是否仍必填）
#         register 是否补了新默认值（lib/index.js 的 register / validateRuntimeSkill）
#         加载期校验形状（lib/index.js 的 validateDefinition）
#         register / registerProvider 签名与分层语义（同文件 + README）
```

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-09：订正 `source` 为必填字段，补写入路径不补默认值与加载期校验两条事实，复核版本升至 0.2.2-rc.1
