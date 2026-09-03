# apb-coding — APB 渐进编码助手（Agent Preset + 插件）

一个可跨项目复用的 DSH Agent 预设：在完整编码 Agent（蓝本 `standard`）之上，
用 persona 定义 **Ask / Plan / Build 三模式语义** 与 **人类式小步渐进开发纪律**，
并由两个持久插件把模式变成**真实会话状态**（而不是靠模型每轮自报、自觉遵守）。

## 工作模式（v2：真实权限强制）

| 模式 | 语义 | 宿主权限预设（执行层强制） |
| --- | --- | --- |
| `ask` | 用户与 AI 问答式对话：澄清意图、权衡方向、找方案漏洞 | `read-only`（文件沙箱拒绝一切写入） |
| `plan` | 依据 ask 对话产出计划（目标/入口/文件布局/TODO/分模块顺序/验证方式） | `read-only` |
| `build` | 依据已确认的计划执行：写文件、跑命令、调试、重构 | `workspace-write` |

- 切换 = 调宿主 `permissionPresets.set()`：模型在 ask/plan 下**物理上写不了文件**，
  不是 prompt 层"请只读"。模型上下文里的 `Current DSH file policy:` 行即当前模式。
- 切换方式：composer 输入区右侧 **APB chip**（点击循环）· **Alt+M** 快捷键 ·
  或直接输入 `/apb [ask|plan|build|next|status]`。
- 模式状态**随会话持久**（logged `apb/mode` 事件，resume/fork 自动恢复），默认 `ask`。
- 回复**不**再每轮加 `[ask]` 前缀；persona 只保留语义与纪律，状态由系统承载。

## 渐进式小步工作流（persona 内置）

1. 先思考讨论、确认方向无漏洞，再动代码；
2. 定代码入口 + 小型文件/步骤布局；
3. 用 todo 立占位；
4. 一个模块一个模块实现并逐个验证；
5. 整个流程端到端走通才算第一遍完成；
6. 之后分步重构，一次一类：
   a. 散落变量收拢进对象；
   b. 一部分步骤提炼成有名字的方法；
   c. 剩余散落步骤全部方法化；
   d. 逐模块审核：拆分"一个方法干多件事"、拆解过多条件，朝内聚/模块化优化；
   e. 审视外层架构与分层：外层流程编排层 / 内层业务实现层，业务层若掺编排职责则重构分离。

禁止一次抛出一大堆思考与实现。

## 组成

| 单元 | 位置 | 作用 |
| --- | --- | --- |
| profile bundle `@deepseek-ai/dsh-apb` | profile 的 pnpm 依赖与 `dsh.profile.bundles` | 统一挂载 host 状态机和 client UI |
| preset 组成+persona | `${DSH_HOME}/.agent-presets/apb-coding/` | 模式语义与渐进纪律 |
| profile 用户 patch | `${DSH_HOME}/profiles/web/cordis.patch.yml` | 用户自己的覆盖层，不由 APB 安装器编辑 |

`enabled` 数据驱动可见性：client 只在本会话 `agent-preset/selected = apb-coding` 时
渲染 chip / 监听 Alt+M；其他预设会话不显示、不响应。

## 安装位置与使用

- bundle：从仓库根目录执行 `dsh plugin --profile web add .`，或安装
  `@deepseek-ai/dsh-apb` 的 registry/tarball 包；DSH 自动维护 profile manifest。
- preset：`${DSH_HOME:-$HOME/.dsh}/.agent-presets/apb-coding/`。
- 使用：新开会话选择 Agent 预设「APB 渐进编码助手」，输入区右侧出现 APB chip。
  默认 ask（只读）；Alt+M 或点 chip 循环 ask→plan→build→ask。
- 卸载：`dsh plugin --profile web remove @deepseek-ai/dsh-apb`。
- 注意：bundle 改动需**重启 DSH** 才装载生效；preset 是独立对象，不由
  `dsh plugin remove` 删除。

## 快捷键配置

默认 **Alt+M**。键位定义在 client 插件
`lib/client.js` 顶部 `HOTKEY = { key: "m", altKey: true, ... }` 常量，改后需
重建/重启（web dev watcher 在跑则自动热更）。冲突时改这里即可。

## 迁移到其他机器

插件 bundle 使用 DSH 标准方式迁移：在目标机器的目标 profile 中安装发布包或
tarball。

```powershell
dsh plugin --profile web add @deepseek-ai/dsh-apb
# 或安装本地交付包：
dsh plugin --profile web add .\deepseek-ai-dsh-apb-<版本>.tgz
```

bundle 的升级和卸载也必须使用 `dsh plugin update/remove`。`apb-coding` preset
不属于 profile bundle，不能通过复制插件目录来伪造安装状态。

要求：目标机器运行同一（或更新的）DSH 版本；插件依赖（cordis/zod、react、
`dsh-*` 运行时）随 DSH 发行已存在。

## 迭代演进

- **语义/纪律**：编辑 `agent.cordis.yml` 中 `persona` 行的 `text`。
- **模式↔权限映射**：`dsh-apb-mode/lib/index.js` 的 `MODE_PERMISSION`；
  预设表由宿主 `dsh-permission-presets` 定义（read-only/workspace-write/danger-full-access）。
- **UI/键位**：`dsh-client-ui-apb-mode/lib/client.js`（chip、HOTKEY、`/apb next`）。
- **组合**：preset 行在 `agent.cordis.yml`，web 行在 `profiles/web/cordis.patch.yml`；
  增删发布服务的行须遵守 realm 规则，改动后用 roster `standingKeyFor('apb-coding')`
  挂载验证。
- **详情可下沉**：把长篇幅方法学拆进 preset 自带 `skills/` 目录
  （参照 cordis 预设的 `customSkillDirs`），persona 保持精炼。

## 边界与后续

- build = `workspace-write`（与宿主默认一致，超范围仍需 ask）；若某项目要
  `danger-full-access`，改 `MODE_PERMISSION.build` 映射即可。
- 模式与宿主手动 `access-mode` 控件并存：两者都写同一 permission knob，
  手动切换权限不会改 apb 模式语义（仅改档位）；切 apb 模式会按映射覆盖档位。
