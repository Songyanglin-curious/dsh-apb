# 本地调试

仓库提供 `scripts/debug.ps1`，用于复用一个隔离 DSH 环境。默认目录是仓库下的
`.debug/dsh-home`，已被 Git 忽略，不会读写日常使用的 `%USERPROFILE%/.dsh`。

## 一键启动

在仓库根目录执行：

```powershell
.\scripts\debug.ps1
```

首次运行会自动：

1. 创建隔离 `DSH_HOME`；
2. 将当前源码打成临时 tarball，移除上一次调试包后再用 `dsh plugin` 安装；
3. 生成隔离的 `apb-coding` preset 副本；
4. 检查 composed config 中的 APB 行；
5. 在 `8081` 端口启动 DSH 并打开浏览器。

停止服务使用 `Ctrl+C`。修改 host、client 或 preset 源码后，重新运行同一命令即可。

## 常用动作

```powershell
# 只准备环境，不启动服务
.\scripts\debug.ps1 setup

# 查看调试目录、bundle 和 composed config 状态
.\scripts\debug.ps1 status

# 重新打包、安装并检查，但不启动服务
.\scripts\debug.ps1 refresh

# 不自动打开浏览器，使用系统分配的空闲端口
.\scripts\debug.ps1 start -NoOpen -Port 0

# 移除隔离 profile 中的 APB bundle 和生成的 preset
.\scripts\debug.ps1 clean
```

`clean` 不删除整个调试 DSH_HOME，因此会保留该环境中的模型设置、会话和其他 profile
数据。

脚本不使用 pnpm `link:`。DSH 插件的 peer dependencies 位于 profile 依赖环境，直接
链接仓库会让 Node 从仓库目录解析依赖并出现 `ERR_MODULE_NOT_FOUND`；临时 tarball
既避免这个问题，也更接近正式安装行为。为防止 pnpm 保留旧链接或同版本缓存，每次
`start` 都会自动重新打包并替换上一次调试包，因此修改任何源码后仍只需重新执行
一条启动命令。

## 当前兼容处理

源码 preset 仍引用已退役的 `@deepseek-ai/dsh-apb-mode`，而统一 bundle 已经在 profile
层挂载 host controller。脚本生成 preset 副本时，仅在副本中移除这段旧挂载，避免
找不到旧包或重复发布服务；源码不会被修改。

这是 APB-003 的临时调试处理，不代表该问题已经关闭。正式交付仍需统一 bundle 与
preset 的挂载职责。

## 调试观察点

- 终端：查看 bundle 加载、Cordis service 和 preset mount 错误。
- Browser Console：查看 client module、React 和 remote command 错误。
- Browser Network：确认 `/plugins/@deepseek-ai/dsh-apb/client.js` 返回成功。
- `/apb status`：只用于观察 APB logged mode；当前不能作为真实权限证明。
- DSH 原生权限控件和实际写入测试：用于核对有效 file policy。

当前仍有默认 ask 未同步只读、同模式不重同步、原生 plan 冲突和 UI 吞错等问题。
完整验收边界见[已知问题](../project/known-issues.md)。

## 已验证范围

在 Windows PowerShell `5.1`、PowerShell `7.6` 和 DSH `0.1.1-rc.2` 上已验证脚本
语法、`setup`、`status`、`start -NoOpen -Port 0`、Web 根页面、
`/plugins/@deepseek-ai/dsh-apb/client.js` 和 `clean`。浏览器中的 chip 交互、三模式
权限和 resume/fork 仍未验收。
