# 项目规范

- 所有新增或替换的位图资产必须转换为有损 WebP（质量 100，FFmpeg 参数 `-lossless 0 -quality 100`）；`public/` 中不保留 PNG、JPEG、GIF 等原图。
- 图片转换使用 Node.js 调用系统级 FFmpeg（含 libwebp 编码器）；确保 `node`、`ffmpeg`、`ffprobe` 在 PATH 中，无需 Python/Pillow。
- 将新图片放入 `public/asset/` 对应目录，然后运行 `node scripts/convert-images.cjs`。脚本生成 WebP、更新 public 中以 `/` 开头的完整资源路径引用，并将原图按 `public/asset/` 内相对路径归档到根目录 `original-assets/`。
- 原图必须保留在 `original-assets/`，不部署到 public；不要覆盖同名归档或 WebP。替换图片时使用新文件名。
- 转换后验证尺寸、可解码性及透明通道；有损编码不要求 RGB 像素一致。检查引用；相对路径或动态拼接路径需手动更新。动画图片需要单独处理并验证，不得丢失动画帧。SVG 为矢量资产，不进行 WebP 转换。
