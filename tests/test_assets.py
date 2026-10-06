"""Validate deployment assets and archived originals without modifying files."""
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

import subprocess


def dimensions(path):
    import json
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "json", str(path)],
        check=True, capture_output=True,
    )
    return json.loads(result.stdout)["streams"][0]


def pixels(path):
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
         "-map", "0:v:0", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
        check=True, capture_output=True,
    ).stdout

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

    def test_webp_dimensions_alpha_and_lossy_encoding(self):
        for path in (PUBLIC / "asset").rglob("*.webp"):
            relative = path.relative_to(PUBLIC / "asset")
            matches = list((ROOT / "original-assets" / relative.parent).glob(relative.stem + ".*"))
            with self.subTest(asset=relative):
                self.assertEqual(len(matches), 1, "Each WebP must have one archived original")
                self.assertEqual(dimensions(path), dimensions(matches[0]))
                converted, original = pixels(path), pixels(matches[0])
                self.assertEqual(len(converted), len(original))
                self.assertEqual(converted[3::4], original[3::4])
                self.assertIn(b"VP8 ", path.read_bytes(), "Expected lossy WebP")

    def test_video_originals_are_archived(self):
        for path in (PUBLIC / "asset").rglob("*"):
            if path.suffix.lower() not in {".mp4", ".webm"}:
                continue
            with self.subTest(asset=path):
                original = ROOT / "original-assets" / path.relative_to(PUBLIC / "asset")
                self.assertTrue(original.is_file())
                self.assertEqual(path.read_bytes(), original.read_bytes())


if __name__ == "__main__":
    unittest.main()
