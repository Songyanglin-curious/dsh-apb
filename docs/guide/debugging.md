# 本地调试入口

本地调试方案已经拆成两份自包含文档：

- [设计思路](../architecture/apb-local-development-design.md)：解释为什么采用共享
  `DSH_HOME`、独立 `apb-dev` Profile、仓库 `link:`、Preset overlay、Client HMR 与
  Host 整进程重启。
- [使用说明](apb-local-development-usage.md)：提供首次准备、启动、热更新、状态检查、
  故障排查、清理和 tarball 发布验证命令。

如果只需要开始开发，在仓库根目录执行：

```powershell
pnpm install
pnpm dev
```

默认使用 `apb-dev` Profile，不修改日常 `web` Profile。
