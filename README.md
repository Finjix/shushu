# Shushu

个人求职与作品网站的静态页面。当前仅展示栏目框架，不包含个人资料、作品、经历或联系方式。

## 本地预览

在仓库根目录运行 `python -m http.server 8000 --directory public`，然后访问 `http://localhost:8000`。

## 发布

Cloudflare Pages 连接本仓库的 `main` 分支，构建命令留空，输出目录设为 `public`。推送到 `main` 后自动发布。

域名 `shushu.finjix.top` 在 Pages 中作为自定义域名添加；DNSPod 的 `shushu` CNAME 指向 Pages 分配的 `*.pages.dev` 地址。
