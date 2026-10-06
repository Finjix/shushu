# Shushu

Finjix 的终端风格静态个人主页，展示“技术 × 设计”的个人介绍和两段实习经历。使用原生 HTML、CSS 和 JavaScript，无构建步骤或运行时依赖。

## 浏览方式

- 点击电源按钮或电源页任意位置启动（滚轮也可），依次播放启动日志、`cat welcome.txt` 和个人介绍，配有键盘音效。
- 实习图片按需加载：开始播放个人介绍时后台预加载实习经历01 的图片，进入实习经历01 时预加载实习经历02，首屏不会一次性加载全部图片。
- 介绍及第一段实习结束后显示继续提示：桌面端为“↓鼠标滚轮或单击继续”，向下滚动或点击正文进入下一段；移动端或窄屏为“单击继续”，轻点内容区域进入下一段。
- 也可使用 Enter 或空格继续。播放期间和重复操作不会重复开启内容；向上滚动仅用于回看，点击实习图片只打开预览，不进入下一段。
- 依次输入 `cat 实习经历01.html` 和 `cat 实习经历02.html`，显示网易互娱和点点互动 AI Foundry 的实习经历。旧内容保留在上方，新命令行保持可见，结尾提示符紧接正文。最后一段结束后不再显示继续提示。
- 点击左上角圆点打开设置与跳转菜单，可直接跳转到个人介绍或任一实习经历，也可切换动画效果与电源启动页。关闭动画后文字立即显示，动画和音效停用。设置保存在当前站点的浏览器 `localStorage` 中，刷新后仍然保留：动画开关立即生效，电源启动页开关在刷新后生效。浏览器禁止存储时，切换仍对当前页面有效。

## 本地预览

运行中的预览服务会自动重载：只要 `http://127.0.0.1:8000/` 能访问，修改 `public/` 下的 HTML、CSS、JavaScript 或图片后，页面会在约 1–2 秒内自动刷新。**不要结束该 Python 进程，也不需要重启服务。**

首次启动可双击根目录的 `start.cmd`，或在仓库根目录运行 `python scripts/dev-server.py`，然后访问 `http://127.0.0.1:8000/`。`start.cmd` 自动打开浏览器：已有本项目预览服务时直接复用，端口被其他服务占用时安全报错，不会结束任何已有进程。也可运行 `python scripts/dev-server.py --open-browser`。新服务启动后保持命令窗口打开，按 `Ctrl+C` 停止服务。刷新脚本仅由本地服务注入，不会进入线上页面。

动画模式由站点开关控制，不随系统“减少动态效果”设置变化。即使 JavaScript 不可用，个人介绍、实习图片和带原生控件的视频仍会直接显示，设置菜单禁用。

页面支持浏览器缩放；图片预览内使用独立的滚轮/双指缩放。媒体弹窗左上角红点可关闭，也可按 Escape。视频弹窗提供原生播放控件，操作视频不会关闭弹窗。

## 内容与验证

正文及命令文案位于 `public/index.html`，布局位于 `public/styles.css`，播放流程、输入方式和设置持久化位于 `public/main.js`。命令中的文件名仅用于终端展示，不会请求独立的 HTML 或 TXT 文件。修改脚本或样式后，同步更新 HTML 中资源链接的版本参数，避免旧缓存。

提交前运行：

```sh
node --check public/main.js
node --test tests/convert-images.test.cjs
python -m unittest discover -s tests -v
git diff --check
```

图片转换测试使用 Node.js 和系统 FFmpeg，覆盖有损质量 100 编码、归档冲突与动画保护；Python 测试仅使用标准库，覆盖资产检查、预览注入和端口复用。可选浏览器回归测试不参与构建或部署：

```sh
npm install --no-save --package-lock=false playwright-core
npx playwright-core install chromium
node tests/browser-smoke.cjs
```

测试前确保预览服务已运行；`PREVIEW_URL` 可指定测试地址，`BROWSER_EXECUTABLE` 可指定本机 Chrome/Edge，`PLAYWRIGHT_MODULE` 可指定外部安装的 playwright-core 路径。测试覆盖桌面/320px、无脚本媒体、菜单滚轮、预览关闭、视频控件、动画切换/取消及存储受限回退。仍需手动验证真实移动设备的点击、滑动回看及双指缩放。

## 图片资产

所有新增或替换的位图必须使用**有损 WebP（质量 100）**。先将图片放入 `public/asset/` 对应目录，再运行：

```sh
node scripts/convert-images.cjs
```

需安装 Node.js 和系统级 FFmpeg（含 libwebp 编码器），并确保 `node`、`ffmpeg`、`ffprobe` 在 PATH 中；图片转换不依赖 Python 或 npm 包。脚本使用 FFmpeg 的 `libwebp` 编码器，以 `-lossless 0 -quality 100` 进行有损编码，并验证尺寸、可解码性和透明通道（RGB 像素允许变化；质量 100 不等于无损），更新 HTML/CSS/JS/JSON 中的完整资源路径引用，将原图归档到根目录 `original-assets/`（保留 `public/asset/` 内相对目录结构），然后移除 public 内原图。同名 WebP 或归档已存在时会拒绝覆盖；替换资产请使用新文件名。相对路径或动态拼接引用需手动更新。动画图片需单独转换并验证；SVG 保持矢量格式。

视频不参与 WebP 转换：直接放入 `public/asset/` 对应目录，用原生 `<video>` 引用（首屏 `data-src` 懒加载，浏览上一模块时预取），原片同时保留在 `original-assets/`。当前 UE 玩法视频使用 VP9 WebM（CRF 32、810×720、30 fps、Opus 64 kbps），原始 MP4 保留在归档中；VP9 播放需目标浏览器支持，当前未提供 H.264 回退。

## 发布

Cloudflare Pages 连接本仓库的 `main` 分支，构建命令留空，输出目录设为 `public`。推送到 `main` 后自动发布。

域名 `shushu.finjix.top` 在 Pages 中作为自定义域名添加；DNSPod 的 `shushu` CNAME 指向 Pages 分配的 `*.pages.dev` 地址。
