# DSH-X macOS 移植候选版

基于 yyh-001/DSH-X 提交 e1ca30400bf826c58b82de1ac595d2f2869bb2f2，版本 0.1.12。

## 当前状态

这是待 macOS 构建验证的源码，**不是已编译的 App**。
Linux 环境已验证 JavaScript 语法、平台路径、XML 转义，以及管理服务 HTTP 启停和非 Windows 自更新隔离（3 个测试通过，1 个 macOS 专属测试跳过）。
尚未运行 macOS Rust 编译、原生界面、代码签名、完整 DSH 安装/插件安装测试，不能把源码检查视为移植成功。

## 改动

- 原生 Rust 启动器添加 macOS 条件分支；识别 .app 的 Contents/Resources/app 布局。
- 使用 macOS open 命令、POSIX PATH 分隔符和内置 node；菜单栏图标支持菜单操作。
- 配置、日志、版本安装和 WebView 数据使用 ~/Library/Application Support/DSH-X；DSH 自身数据仍在 ~/.dsh。
- 通过用户 LaunchAgent 支持下次登录启动。应先把 App 放到最终位置，再开启该选项；移动 App 后重新开关该选项。
- 缺失或不兼容的 npm 下载到用户目录，避免破坏 App 签名。
- DSH 子进程放入独立进程组，停止时发送组 SIGTERM。
- Mac 禁止下载/运行上游 Windows 启动器更新包，启动器本身需手动更新。DSH 版本管理不受此限制。
- 保留 Windows 打包入口，同时新增 dist:mac。

## 本地 Mac 构建

需要 Xcode Command Line Tools、Rust stable，以及 Node.js 22.19+（22.x）或兼容的 24+。

```bash
xcode-select --install
# 安装 Rust 后在项目目录执行：
npm run test:mac-port
npm run dist:mac
```

项目本身没有 npm 运行依赖。打包脚本会下载并核对 Node 22.19.0 的官方 SHA-256，随包加入 npm 与 pnpm 8.15.9，再编译原生启动器。
构建结果：

- release/DSH-X.app
- release/DSH-X-macOS-arm64.zip（Apple Silicon）或 release/DSH-X-macOS-x64.zip（Intel）
- 对应的 .sha256 校验文件

构建架构跟随运行构建的 Mac，不能把 Intel 二进制改名为 arm64。
脚本会检查签名，并启动 App 验证管理 HTTP 服务、用户数据目录和正常退出。此检查不等于人工界面验证，也不包含 DSH 模型调用。
默认使用 ad-hoc 签名，没有 Apple Developer ID 签名或公证；下载到其他 Mac 时，系统可能要求在“系统设置 → 隐私与安全性”中确认打开。

## GitHub Actions 云端构建

已准备 `.github/workflows/macos.yml`。在有权限的 fork 或你自己的仓库中，推送 `macos-port` 分支会自动构建；也可将工作流放到默认分支，通过 Actions 的 **Build macOS App → Run workflow** 手动运行。
两种架构分别使用 `macos-14`（arm64）和 `macos-15-intel`（x64）。
构建通过后，从该次运行的 Artifacts 下载压缩包。流程不会自动发布 Release，也不需要 Apple 签名密钥。

## 首轮 macOS 验收

1. 构建任务和原生启动冒烟测试通过。
2. 解压、将 App 拖入 Applications，从 Finder 启动。
3. 确认管理窗口、菜单栏菜单、隐藏/重新打开、退出。
4. 安装一个 DSH 版本，启动官方 Web，安装/启停插件，停止后检查没有遗留进程。
5. 开启登录启动、注销/登录验证，再关闭验证。
6. 确认 App 内部没有写入数据，运行前后的 codesign 验证均通过。

上述 macOS 验收当前均未完成。若云端 runner 无可用图形会话，App 冒烟测试可能失败，需要在真实登录的 Mac 会话里进一步确认。
