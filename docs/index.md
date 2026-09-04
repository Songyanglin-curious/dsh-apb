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
- [APB 本地开发调试环境使用说明](guide/apb-local-development-usage.md)：从首次准备到
  热更新、检查、排错、清理和发布包验证的完整操作手册。
- [本地调试入口](guide/debugging.md)：兼容旧链接的导航页。

## 设计与实现

- [架构索引](architecture/index.md)
- [DSH 插件架构与模块关系笔记](architecture/dsh-plugin-architecture-notes.md)：Profile、
  Bundle、Host、Client、Remote、Preset、pnpm link 与热更新的整体关系。
- [APB 本地开发调试环境设计思路](architecture/apb-local-development-design.md)：独立
  Profile、仓库 link、Preset overlay 和双更新链路的设计依据与边界。
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
| `host/lib/index.js` | host 状态机与命令入口 |
| `client/lib/client.js` | web client 模块入口 |
| `presets/apb-coding/preset.yml` | preset 元数据 |
| `presets/apb-coding/agent.cordis.yml` | persona 与 agent-plane 组合 |
| `scripts/dev.ps1` | 独立开发 Profile 的准备、检查和热更新入口 |
| `scripts/verify-package.ps1` | 隔离 tarball 安装与发布包验证入口 |
