# 宿主 skill 注册接口（ctx.skills）

> **类型**：🌐 **外部事实** —— 记的是**宿主（DSH）**能给什么，不是本项目的设计
> **适用版本**：`@deepseek-ai/dsh-skill@0.2.0-rc.2`（宿主版本线 0.2.0-rc.2；升级后按下方「复核方式」重跑）
> **状态**：✅ 已核实（2026-10-16，`npm pack` 解包读 `lib/types/index.d.ts` + `README.md` 原文）
> **来源**：`@deepseek-ai/dsh-skill@0.2.0-rc.2` 解包产物 `lib/types/index.d.ts` + `README.md`

## 一、结论

**「装插件即把 skill 带进 dsh 全局」可行**：host 插件在 `apply` 里调 `ctx.skills.register(skill)` 注册一个内存态 skill；unscoped 注册落**全局层**，模型侧经 `dsh-tool-skill` 消费。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| 注册 API | `register(skill: SkillRegistration): () => void` —— 返回 Cordis effect disposer | `lib/types/index.d.ts:257` |
| 注册进调用 ctx 的层 | *"an unscoped context registers globally"*；host 行与仓库插件落全局层 | `lib/types/index.d.ts:218-222` |
| 必填字段 | `SkillRegistration = Omit<SkillDefinition,'invocation'\|'provider'> & { invocation?, provider? }` ⇒ 必填 `name`（kebab-case）+ `description` + `content`（markdown 正文）；可选 `whenToUse` / `path` / `source` / `resourceBase` / `metadata` / `invocation` / `provider` | `lib/types/index.d.ts:79-84`、`:44-77` |
| invocation 缺省双面可调 | *"omitted invocation and provider fields receive defaults"*；策略 = `modelInvocable` / `userInvocable`，缺省两者皆 true | `README.md` §Use this package；`lib/types/index.d.ts:37-42`、`:254` |
| provider 缺省 = runtime | *"omission uses the registry-owned runtime provider"*；`runtime` 是保留 provider 名 | `README.md` §Use this package |
| 同名 runtime first-wins | *"Same-name runtime entries in one layer are first-wins; a duplicate logs a warning and receives a no-op disposer so it cannot remove the winner"* | `lib/types/index.d.ts:250-253` |
| 层内优先级 | *"Project entries outrank runtime entries, which outrank user entries, within one layer"* | `lib/types/index.d.ts:249` |
| 名字校验 | `isSkillName(name)`：kebab-case 语法 | `lib/types/index.d.ts:22` |
| 资源基座 | `SkillResourceBase` = `{kind:'directory',path}` / `{kind:'url',url}` / `{kind:'opaque',description}`；注释：*"Optional provider-specific base used by loaded skill bodies to resolve relative resources"* | `lib/types/index.d.ts:26-35` |
| 模型侧渲染 | `renderSkillContent(skill)` 产出 `<skill_content>` 块（name 走转义属性、正文原样嵌入） | `lib/types/index.d.ts:143` |
| bundled 优先级 | `BUNDLED_SKILL_RANK = 600`（打包 provider 与本地 bundled root 的标准优先级） | `lib/types/index.d.ts:16` |
| 失效通知 | 注册 / dispose / provider invalidate 后发 `skills/change` 事件；registry **无 TTL**，不推断远端变更 | `lib/types/index.d.ts:203-211`；`README.md` §Known Limitations |

## 三、对本插件的落地含义

1. **内嵌 skill 副本**：插件构建时把 `packages/skill/` 内容（SKILL.md + scripts + assets）纳入产物，`apply` 时 `register({ name: 'koc-ledger-progress', description, content })`。
2. **相对路径解析二选一（未拍板）**：① 正文里插值插件安装目录，保住 skill「scripts/progress.py 相对 SKILL.md 定位」的写法；② 用 `resourceBase: { kind: 'directory', path: <安装目录> }`（宿主原生机制，但消费者如何呈现待验证）。
3. **卸载即失效**：`register` 返回的 disposer 随插件 dispose 自动注销，无需额外清理。
4. **独立分发不依赖宿主**：`koc-ledger-progress` npm 包零代码直发（SKILL.md + scripts + assets），其他 agent 按各自约定安装；与插件内嵌副本同源（见 [`../architecture.md`](../architecture.md) 不变量 2）。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-skill dist-tags --json        # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-skill@<版本> && tar xzf *.tgz
# 看两处：SkillRegistration 形状是否变（lib/types/index.d.ts）
#         register / registerProvider 签名与分层语义（同文件 + README）
```
