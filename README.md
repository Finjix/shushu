# Shushu

Finjix 的静态个人主页，展示“技术 × 设计”的介绍与广东技术师范大学数字媒体技术系信息。目前没有作品、经历或联系方式页面。

## 本地预览

双击根目录的 `start.cmd` 启动本地预览并打开浏览器。脚本会先强制结束占用本机 8000 端口的进程；请先保存该进程中的工作。保持命令窗口打开，按 `Ctrl+C` 停止服务。也可以在仓库根目录运行 `python -m http.server 8000 --directory public`，然后访问 `http://localhost:8000`。

首页始终使用相同的启动和打字效果，不随系统“减少动态效果”设置变化。即使 JavaScript 不可用，介绍内容也会直接显示。

## 发布

Cloudflare Pages 连接本仓库的 `main` 分支，构建命令留空，输出目录设为 `public`。推送到 `main` 后自动发布。

域名 `shushu.finjix.top` 在 Pages 中作为自定义域名添加；DNSPod 的 `shushu` CNAME 指向 Pages 分配的 `*.pages.dev` 地址。
