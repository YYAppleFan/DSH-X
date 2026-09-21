# DSH-X macOS 移植指南

基于 YYAppleFan/DSH-X 分支，已合入 master 最新安全补丁（DNS rebinding 防护、动态端口顺延等），完成针对 macOS 平台的完整原生适配。

## 平台改动与特性

- **原生 Rust 启动器**：
  - 启动器适配 macOS 架构，无边框原生 WebView 窗口与系统托盘菜单；
  - 自动识别 macOS 应用包结构（`.app` 内 `Contents/Resources/app` 路径）；
  - 托盘（菜单栏图标）左键直接弹出操作菜单（符合 macOS 系统惯例）；
  - 链接打开通过 `/usr/bin/open` 调用系统默认浏览器。
- **状态与缓存存储**：
  - 应用配置、日志、缓存与 WebView 数据遵循 Apple 规范存储于 `~/Library/Application Support/DSH-X`；
  - DSH 官方自身数据保持在 `~/.dsh`，切换版本与启动器均无损兼容。
- **开机自启**：
  - 通过用户级 LaunchAgent 支持登录自启（生成 `~/Library/LaunchAgents/local.dsh-x.launcher.plist`），并在关闭自启时安全清理。
- **进程生命周期管理**：
  - DSH 子进程以独立进程组启动（`detached: true`），停止或重启时发送组 `SIGTERM`（`process.kill(-pid, 'SIGTERM')`），杜绝孤儿进程残留。
- **便携环境隔离**：
  - 打包内置官方 Node.js 绿色运行时与 pnpm 8.15.9，App 外部下载运行依赖隔离至用户目录，不破坏 App 代码签名。
- **跨平台构建**：
  - 保留 Windows 打包入口，新增 `npm run dist:mac`。

## 本地 Mac 构建

需要 Xcode Command Line Tools、Rust stable，以及 Node.js 22.18+。

```bash
# 运行单元与集成测试
npm run test:mac-port

# 打包 macOS App（自动下载 Node、编译 Rust 启动器、生成 AppIcon.icns、代码签名与冒烟测试）
npm run dist:mac
```

构建结果将输出至：
- `release/DSH-X.app`
- `release/DSH-X-macOS-arm64.zip`（或 `release/DSH-X-macOS-x64.zip`）
- `release/DSH-X-macOS-${arch}.zip.sha256`

## GitHub Actions 云端构建

已提供 `.github/workflows/macos.yml`，支持通过 GitHub Actions 自动矩阵构建 `arm64`（Apple Silicon）与 `x64`（Intel）两种架构的发布包。
