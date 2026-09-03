# APB v2 更新包（Ask / Plan / Build 渐进编码助手）

一键把 **APB v2**（真实权限三模式 + UI chip + Alt+M）迁移到另一台已装 DSH 的机器。

## 包含内容（四件套）

| 组件 | 包内路径 | 安装到目标机的相对路径 |
| --- | --- | --- |
| 1. preset（persona + 挂载行 + README/文档） | `apb-coding/` | `$DSH_HOME/.agent-presets/apb-coding/` |
| 2. host 插件 | `dsh-apb-mode/` | `$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-apb-mode/` |
| 3. client 插件（chip + Alt+M） | `dsh-client-ui-apb-mode/` | `$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-client-ui-apb-mode/` |
| 4. profile 组合行 | `install.ps1` 自动处理 | `$DSH_HOME/profiles/web/cordis.patch.yml` |

其中 `$DSH_HOME` = 环境变量 `DSH_HOME`，未设置时为 `%USERPROFILE%\.dsh`。

## 安装步骤（目标机器）

1. 确认目标机器已安装**同一或更新版本**的 DSH（依赖 `@deepseek-ai/cordis`、`zod` 等随 DSH 发行自带，无需单独安装）。
2. 把本目录（或解压后的 `APB-v2-update`）拷到目标机器。
3. 右键 `install.ps1` → “使用 PowerShell 运行”；或打开终端执行：

   ```powershell
   cd <本目录>
   ./install.ps1
   ```

4. 脚本会：定位 DSH_HOME → 安装 preset → 安装两个插件包 → 把 `ui-apb-mode`
   组合行写入 `cordis.patch.yml`（若该文件已有自定义内容且非空，脚本不会覆盖，
   会打印需要手动追加的块）。
5. **重启 DSH**：关闭当前 `dsh web` 进程后重新运行 `dsh web`，然后刷新浏览器页面。
6. 新建会话，选择 Agent 预设 **「APB 渐进编码助手」**。

## 验证清单

- 输入区右侧出现 **APB chip**（仅 APB 会话显示）；
- **Alt+M** 或点击 chip 循环 ask → plan → build → ask；
- `/apb status` 可查当前模式；
- 切换后模型上下文 `Current DSH file policy` 在 `read-only`（ask/plan）与
  `workspace-write`（build）间真实变化，ask/plan 下模型写文件会被沙箱拒绝；
- 会话重启/恢复后模式保持。

## 手动安装（不想用脚本时）

```powershell
$dsh = "$env:USERPROFILE\.dsh"          # 或 $env:DSH_HOME
Copy-Item -Recurse apb-coding        "$dsh\.agent-presets\apb-coding"
Copy-Item -Recurse dsh-apb-mode      "$dsh\profiles\node_modules\@deepseek-ai\dsh-apb-mode"
Copy-Item -Recurse dsh-client-ui-apb-mode "$dsh\profiles\node_modules\@deepseek-ai\dsh-client-ui-apb-mode"
# 然后确保 profiles\web\cordis.patch.yml 顶层含：
# - insert:
#     - id: ui-apb-mode
#       name: '@deepseek-ai/dsh-client-ui-apb-mode'
```

## 常见问题

- **新会话看不到 APB 预设**：preset 目录没放对位置，或 DSH 版本过旧。
- **有 chip 但 Alt+M 无反应**：先点一下会话输入区再按；键位在
  `dsh-client-ui-apb-mode/lib/client.js` 顶部 `HOTKEY` 常量，可改后重启。
- **patch 文件报错无法启动**：多为手工合并缩进错误；检查 `cordis.patch.yml`
  顶层数组缩进与 `- insert:` 对齐。
