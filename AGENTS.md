# 项目规范

- 所有新增或替换的位图资产必须转换为无损 WebP；`public/` 中不保留 PNG、JPEG、GIF 等原图。
- 安装转换依赖：`python -m pip install -r scripts/requirements.txt`。
- 将新图片放入 `public/asset/` 对应目录，然后运行 `python scripts/convert-images.py`。脚本生成 WebP、更新 public 中以 `/` 开头的完整资源路径引用，并将原图按 public 内相对路径归档到根目录 `original-assets/`。
- 原图必须保留在 `original-assets/`，不部署到 public；不要覆盖同名归档或 WebP。替换图片时使用新文件名。
- 转换后检查引用；相对路径或动态拼接路径需手动更新。动画图片需要单独处理并验证，不得丢失动画帧。SVG 为矢量资产，不进行 WebP 转换。
