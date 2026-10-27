# Shushu

Finjix 的终端风格静态个人主页，展示“技术 × 设计”的个人介绍和两段实习经历。使用原生 HTML、CSS 和 JavaScript，无构建步骤或运行时依赖。

## 浏览方式

- 点击电源按钮或电源页任意位置启动（滚轮也可），依次播放启动日志、`cat welcome.txt` 和个人介绍，配有键盘音效。
- 图片和视频按板块预加载：进入某个板块时立即加载它自己的资源，同时在后台预取下一个板块、再往后一个板块排在最后，首屏不会一次性加载全部资源。详见下方“预加载”。
- 介绍及第一段实习结束后显示继续提示：桌面端为“↓鼠标滚轮或单击继续”，向下滚动或点击正文进入下一段；移动端或窄屏为“单击继续”，轻点内容区域进入下一段。
- 也可使用 Enter 或空格继续。播放期间和重复操作不会重复开启内容；向上滚动仅用于回看，点击实习图片只打开预览，不进入下一段。
- 依次输入 `cat 实习经历01.html` 和 `cat 实习经历02.html`，显示网易互娱和点点互动 AI Foundry 的实习经历；随后是 `cat showcase.html` 作品展示、`cat 精选案例01.html`（视频 AI 混剪，含流程图与成片）和 `cat 精选案例02.html`（AI 3D 试玩广告，内嵌可直接操作的试玩）。旧内容保留在上方，新命令行保持可见，结尾提示符紧接正文。最后一段结束后不再显示继续提示。
- 点击左上角圆点打开设置与跳转菜单，可直接跳转到个人介绍、任一实习经历、作品展示或任一精选案例，也可切换动画效果与电源启动页。关闭动画后文字立即显示，动画和音效停用。设置保存在当前站点的浏览器 `localStorage` 中，刷新后仍然保留：动画开关立即生效，电源启动页开关在刷新后生效。浏览器禁止存储时，切换仍对当前页面有效。

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

## 预加载

板块内容由 `cat` 手动触发，下一个板块可预知，`main.js` 里的预加载队列按此安排：

- 板块内所有带 `data-src` 的 `<img>` / `<video>` 都由队列加载；新增图片、视频时用 `data-src`，并写上实际的 `width`/`height`，加载完成后原位出现、不挤动布局。没有脚本时的显示放在 `<noscript>` 里。
- 优先级：当前板块（立即加载、不限并发、图片 `fetchpriority=high`）> 下一板块（后台预取，最多 2 个并发）> 再往后一个板块及跳转时上方的旧板块（只在前两者都下载完后才开始）。
- 视频预取只拉元数据和首帧（`preload="metadata"`），轮到当前板块时升级为 `auto` 继续缓冲。名额在图片下载完、视频拿到首帧/元数据、出错或 8 秒超时后释放。
- 省流量模式（`Save-Data`）或 2G 网络下只加载当前板块。
- 播放到某段时最多等待 5 秒资源；超过 300 毫秒仍未就绪时在正文下方显示 `Loading...`。从菜单跳转只等待目标板块最多 1.5 秒，上方旧板块的资源在后台补齐。
- 内联视频离开视口时暂停，回到视口时继续。试玩 iframe 不进队列，另有调度（见上方精选案例02）。

## 图片资产

所有新增或替换的位图必须使用**有损 WebP（质量 100）**。先将图片放入 `public/asset/` 对应目录，再运行：

```sh
node scripts/convert-images.cjs
```

需安装 Node.js 和系统级 FFmpeg（含 libwebp 编码器），并确保 `node`、`ffmpeg`、`ffprobe` 在 PATH 中；图片转换不依赖 Python 或 npm 包。脚本使用 FFmpeg 的 `libwebp` 编码器，以 `-lossless 0 -quality 100` 进行有损编码，并验证尺寸、可解码性和透明通道（RGB 像素允许变化；质量 100 不等于无损），更新 HTML/CSS/JS/JSON 中的完整资源路径引用，将原图归档到根目录 `original-assets/`（保留 `public/asset/` 内相对目录结构），然后移除 public 内原图。同名 WebP 或归档已存在时会拒绝覆盖；替换资产请使用新文件名。相对路径或动态拼接引用需手动更新。动画图片需单独转换并验证；SVG 保持矢量格式。

视频不参与 WebP 转换：直接放入 `public/asset/` 对应目录，用原生 `<video>` 引用（`data-src` 交给预加载队列），原片同时保留在 `original-assets/`。当前 UE 玩法视频使用 VP9 WebM（CRF 32、原始分辨率 1080×960、30 fps、Opus 64 kbps），原始 MP4 保留在归档中；VP9 播放需目标浏览器支持，当前未提供 H.264 回退。

精选案例01 在正文右侧预留了两个 9:16 视频占位（`#case01-videos`，窄屏时移到列表下方）。放入成片时：把视频放进 `public/asset/case01/`（原片同时归档到 `original-assets/case01/`），按 `index.html` 中占位旁注释的模板把占位 `div` 换成带 `data-src` 的 `<video>`，并同步替换 `<noscript>` 内对应的占位。`width`/`height` 写视频的实际尺寸；弹窗比例按视频实际宽高自动计算，多个视频并排时按同一高度缩放以适配屏幕。

精选案例02 用 `<iframe data-src>` 内嵌 `public/asset/case02/围炉煮冰-试玩.html`（Three.js 单文件试玩，模型、贴图和脚本以 zip 形式内嵌在 HTML 中）。两处 iframe 都带 `sandbox="allow-scripts"`（不同源），支持的浏览器（如桌面 Chrome）会把试玩放到独立进程，试玩启动时约 1 秒的主线程占用不再卡住本页的打字动画和滚动。内联 iframe 只作自动演示预览（不响应操作，`?preview` 半帧率），在该段揭晓后、浏览器空闲且出现在视口内时才加载，不参与下一模块预取；离开视口或弹窗打开时暂停渲染，段落被重置时卸载。点击后在 macOS 风格的媒体弹窗中从头加载一份完整帧率的试玩（窄屏全屏），展开动画结束后才开始加载，关闭后内联预览直接恢复、无需重载。试玩页内置一段实时合成的 BGM（Web Audio，无音频文件；轻快风格，C 大调 C-G-Am-F、118 BPM，拨弦旋律 + 反拍和弦 + 跳跃低音 + 轻鼓，内联预览静音，弹窗 iframe 带 `allow="autoplay"` 打开即响，被浏览器拦截时在首次触摸后开始，随暂停/页面隐藏静音）和一个 `requestAnimationFrame` 闸门，响应父页面的 `postMessage({ playable: 'pause' | 'resume' })`，并把试玩内的 Escape 转发给父页面关闭弹窗。原始试玩保留在 `original-assets/case02/`；部署版本关闭了 Bloom 炫光（bundle 中 `bloom` 默认改为关闭，URL 加 `?bloom=1` 可恢复对比），去掉了 three.js 启动时上百条 `toNonIndexed` 警告，内嵌的 PNG/JPEG（包括封面与警示语 data URI）已按项目规范转为有损 WebP（质量 100，透明通道与尺寸已校验，内嵌文件名不变，加载器按文件头识别格式）。

## 发布

Cloudflare Pages 连接本仓库的 `main` 分支，构建命令留空，输出目录设为 `public`。推送到 `main` 后自动发布。

域名 `shushu.finjix.top` 在 Pages 中作为自定义域名添加；DNSPod 的 `shushu` CNAME 指向 Pages 分配的 `*.pages.dev` 地址。
