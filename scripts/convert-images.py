"""Convert public raster images to lossless WebP and archive originals."""
from pathlib import Path
import shutil
import sys

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ARCHIVE = ROOT / "original-assets"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"}


def archive_relative(relative: Path) -> Path:
    """Map a public-relative path to its archive path; public/asset is the archive root."""
    parts = relative.parts
    return Path(*parts[1:]) if parts and parts[0] == "asset" else relative


def main():
    if not features.check("webp"):
        raise RuntimeError("Pillow requires WebP support")
    sources = sorted(p for p in PUBLIC.rglob("*") if p.suffix.lower() in EXTENSIONS)
    replacements = {}
    for source in sources:
        relative = source.relative_to(PUBLIC)
        destination = source.with_suffix(".webp")
        original = ARCHIVE / archive_relative(relative)
        if destination.exists() or original.exists():
            raise FileExistsError(f"Refusing to overwrite: {destination} or {original}")
        temporary = destination.with_suffix(".webp.tmp")
        try:
            with Image.open(source) as image:
                if getattr(image, "n_frames", 1) > 1:
                    raise ValueError(f"Animated images require manual conversion: {source}")
                image.load()
                # Preserve alpha, including RGB values in fully transparent pixels.
                pixels = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                pixels.save(temporary, format="WEBP", lossless=True, exact=True, method=6)
                with Image.open(temporary) as result:
                    if result.convert(pixels.mode).tobytes() != pixels.tobytes():
                        raise RuntimeError(f"Pixel verification failed: {source}")
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, original)
            temporary.replace(destination)
            old_url = "/" + relative.as_posix()
            replacements[old_url] = "/" + destination.relative_to(PUBLIC).as_posix()
            # Update references before removing the original from public.
            for text_file in PUBLIC.rglob("*"):
                if text_file.suffix.lower() not in {".html", ".css", ".js", ".json"}:
                    continue
                text = text_file.read_text(encoding="utf-8")
                updated = text.replace(old_url, replacements[old_url])
                if updated != text:
                    text_file.write_text(updated, encoding="utf-8")
            source.unlink()
            print(f"Converted: {relative.as_posix()}")
        finally:
            temporary.unlink(missing_ok=True)
    print(f"Done: {len(replacements)} images; originals in original-assets/")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Conversion failed: {error}", file=sys.stderr)
        sys.exit(1)
