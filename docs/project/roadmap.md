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

- 决定 host controller 只由 profile bundle 挂载，还是由 preset 挂载；禁止双重挂载。
- 将 preset 中的旧包名迁移到统一包契约，关闭 APB-003。
- 明确 `apb-coding` 的标准安装、升级和卸载机制；若 DSH 暂无 preset CLI，提供可验证、
  可回滚且不污染 bundle 状态的独立流程。
- 在隔离 `DSH_HOME` 中完成 tarball + preset 的冷启动、重启和卸载验收。

验收：profile 无手工 patch、无旧包名、无孤立目录；preset 可发现并成功挂载。

## 阶段 2：权限状态可信化

目标：APB 模式、目标权限和有效权限不再静默脱节。

- 在 APB 会话创建/选择时写入初始化状态并应用 ask 的 `read-only`。
- 显式模式命令始终幂等应用权限，关闭 APB-001 和 APB-002。
- 查询宿主有效 permission preset，把真实值纳入 `/apb status` 和 projection。
- 定义用户通过原生权限控件改档后的策略：同步 APB、自动纠正或明确报警。
- 验证 resume/fork 后不仅恢复模式，还恢复匹配的有效权限。

验收：任意入口切换后，模式、status、chip、file policy 和沙箱行为一致。

## 阶段 3：统一 plan 模式

目标：系统中只存在一个可见、可解释的 plan 状态。

- 评估复用 DSH 原生 plan-mode，或移除 preset 中原生 plan 组并由 APB 独立承载。
- 统一切换命令、prompt section、UI 控件和退出语义，关闭 APB-004。
- 覆盖 ask → plan → build、plan → ask 和外部权限变化等状态转换。

验收：不存在 APB build 与原生 plan 同时生效的组合，也不出现重复模式控件。

## 阶段 4：UI 可靠性与测试

目标：失败可见、输入幂等、回归可自动发现。

- 展示远程命令失败，添加键盘 repeat 过滤和共享并发锁，关闭 APB-006。
- 增加 host 纯函数、命令与 projection 测试。
- 增加 client loader、渲染、错误和快捷键测试。
- 固化 bundle pack/add/dump/remove 集成测试。
- 完成真实 DSH web 的 chip、权限拒写、resume/fork E2E，关闭 APB-007。

验收：所有 P1/P2 问题关闭，核心安全承诺具备自动化和端到端证据。
