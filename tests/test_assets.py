"""Validate deployment assets and archived originals without modifying files."""
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"src", "data-src", "href"} and value and value.startswith("/"):
                self.urls.append(value)


class AssetTests(unittest.TestCase):
    def test_html_local_references_exist(self):
        parser = AssetReferences()
        parser.feed((PUBLIC / "index.html").read_text(encoding="utf-8"))
        for url in parser.urls:
            with self.subTest(url=url):
                self.assertTrue((PUBLIC / unquote(urlsplit(url).path).lstrip("/")).is_file())

    def test_no_original_rasters_deployed(self):
        original_extensions = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"}
        self.assertEqual([str(path) for path in PUBLIC.rglob("*") if path.suffix.lower() in original_extensions], [])

    def test_webp_pixels_match_archived_originals(self):
        for path in (PUBLIC / "asset").rglob("*.webp"):
            relative = path.relative_to(PUBLIC / "asset")
            matches = list((ROOT / "original-assets" / relative.parent).glob(relative.stem + ".*"))
            with self.subTest(asset=relative):
                self.assertEqual(len(matches), 1, "Each WebP must have one archived original")
                with Image.open(path) as converted, Image.open(matches[0]) as original:
                    self.assertEqual(converted.size, original.size)
                    self.assertEqual(converted.convert("RGBA").tobytes(), original.convert("RGBA").tobytes())

    def test_video_originals_are_archived(self):
        for path in (PUBLIC / "asset").rglob("*.mp4"):
            with self.subTest(asset=path):
                original = ROOT / "original-assets" / path.relative_to(PUBLIC / "asset")
                self.assertTrue(original.is_file())
                self.assertEqual(path.read_bytes(), original.read_bytes())


if __name__ == "__main__":
    unittest.main()
