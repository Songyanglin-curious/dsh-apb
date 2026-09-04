# 重构路线图

路线按依赖顺序推进。前一阶段未达到验收口径前，不把后一阶段标记为完成。

## 阶段 0：仓库与文档基线

状态：已完成。

- 建立 Git 基线并迁入源码。
- 使用单一 `@deepseek-ai/dsh-apb` bundle manifest。
- 使用 `dsh plugin` 完成 bundle add/update/remove 生命周期。
- 建立文档索引、现状、问题和路线图，删除旧双包说明与无效包壳。

## 阶段 1：交付模型闭环

目标：全新 DSH 环境只按一种公开流程即可安装、启动和卸载 APB。

当前状态：host/client/preset 边界和包名引用已完成代码整理；全新隔离环境的冷启动、
真实 preset 挂载和卸载残留检查仍未执行。

开发侧已确定为共享 `DSH_HOME` 下的独立 `apb-dev` Profile：bundle 使用仓库 `link:`，
preset root 指向仓库，Client 使用 DSH HMR，Host 变化重启整进程；这不替代正式交付验收。

- 决定 host controller 只由 profile bundle 挂载，preset 不重复挂载；禁止双重挂载。
- 将内部目录与 preset 路径整理为 `host/`、`client/`、`presets/apb-coding/`，并关闭
  APB-003 的代码问题。
- 明确 `apb-coding` 的标准安装、升级和卸载机制；若 DSH 暂无 preset CLI，提供可验证、
  可回滚且不污染 bundle 状态的独立流程。
- 在隔离 `DSH_HOME` 中完成 tarball + preset 的冷启动、重启和卸载验收。

验收：profile 无手工 patch、无旧包名、无孤立目录；preset 可发现并与已安装 bundle
成功组合。

## 阶段 2：权限状态可信化

目标：APB 模式、目标权限和有效权限不再静默脱节。

当前状态：APB-001/002 的 host 代码修复已完成，运行中切入 APB preset 的同步代码已补齐；
真实 DSH/E2E 验收和完整有效权限证明仍未完成。

- 在 APB 会话创建、恢复或选择时初始化瞬时 ask 状态并应用 `read-only`，不写历史事件。
- 显式模式命令始终幂等应用权限，关闭 APB-001 和 APB-002。
- 查询宿主有效 permission preset，把真实值纳入 `/apb status`。
- 保持用户已确认的原生权限改档处理策略不变，并验证切入 APB preset 的即时同步。
- 验证 resume/fork 后不恢复旧模式，而是回到 ask 并同步匹配的 `read-only` 权限。

验收：任意入口切换后，模式、status、chip、file policy 和沙箱行为一致。

## 阶段 3：统一 plan 模式

目标：系统中只存在一个可见、可解释的 plan 状态。

当前状态：已移除 preset 中的原生 plan-mode，DSH Web 后置 patch 会禁用 dsh-base
Host 层的 `plan-mode`；APB host 已成为代码层面的唯一 plan 来源，真实会话交互和
模型行为仍未完成验收。

- 由 APB 独立承载静态 plan 规则、当前模式 runtime context、只读权限、`/apb build`
  确认切换和 UI。
- 统一切换命令、runtime context、UI 控件和确认语义，保持 dsh-web-app 对 dsh-base
  `plan-mode` 的禁用；模式切换不得改写 system prompt。
- 覆盖 ask → plan → build、plan → ask 和外部权限变化等状态转换。

验收：只存在 APB 的 plan 状态和切换入口，静态规则、动态模式上下文、权限与 UI 一致。

## 阶段 4：UI 可靠性与测试

目标：失败可见、输入幂等、回归可自动发现。

- 展示远程命令失败，添加键盘 repeat 过滤和共享并发锁，关闭 APB-006。
- 增加 host 纯函数、命令、瞬时状态与 Remote 接口测试。
- 增加 client loader、渲染、错误和快捷键测试。
- 固化 bundle pack/add/dump/remove 集成测试。
- 完成真实 DSH web 的 chip、权限拒写、resume/fork E2E，关闭 APB-007。

验收：所有 P1/P2 问题关闭，核心安全承诺具备自动化和端到端证据。
