# dsh-apb 文档

这里是项目文档的唯一入口。当前项目处于重构阶段，先以
[项目状态](project/status.md)和[已知问题](project/known-issues.md)为事实基线，
不要从旧设计目标推断现有能力。

## 需求基线

- [原始需求索引](requirements/index.md)
- [APB 工作模式与渐进编码方式原始需求](requirements/apb-work-mode-original.md)：
  保存最初需求原文，不做润色或覆盖。

## 使用指南

- [指南索引](guide/index.md)
- [安装、升级与卸载](guide/installation.md)：DSH 标准 bundle 生命周期、preset
  边界和验收命令。
- [本地调试](guide/debugging.md)：一键准备隔离环境、打包当前源码并启动 DSH。

## 设计与实现

- [架构索引](architecture/index.md)
- [架构与运行链路](architecture/overview.md)：包结构、host/client 数据流、关键
  函数、配置和扩展点。

## 项目管理

- [项目索引](project/index.md)
- [项目状态](project/status.md)：哪些已完成、哪些尚未验证。
- [已知问题](project/known-issues.md)：按优先级维护可复现的问题清单。
- [重构路线图](project/roadmap.md)：按依赖关系排列后续实施顺序。

## 源码导航

| 路径 | 说明 |
| --- | --- |
| `package.json` | 单一发布包 `@deepseek-ai/dsh-apb` 的 manifest |
| `cordis.patch.yml` | profile bundle 安装后的 Cordis patch |
| `dsh-apb-mode/lib/index.js` | host 状态机与命令入口 |
| `dsh-client-ui-apb-mode/lib/client.js` | web client 模块入口 |
| `apb-coding/preset.yml` | preset 元数据 |
| `apb-coding/agent.cordis.yml` | persona 与 agent-plane 组合 |
