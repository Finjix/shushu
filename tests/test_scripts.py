"""Regression tests for asset conversion and the local preview server."""
import importlib.util
import json
import tempfile
import threading
import unittest
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


preview = load_script("dev-server")


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.public = Path(self.temp.name)
        (self.public / "index.html").write_text("<body>hello</body>", encoding="utf-8")
        (self.public / "folder").mkdir()
        (self.public / "folder" / "index.html").write_text("<body>nested</body>", encoding="utf-8")
        patches = patch.object(preview, "PUBLIC", self.public)
        patches.start()
        self.addCleanup(patches.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(preview.PreviewHandler, directory=str(self.public)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.port = self.server.server_address[1]

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, method="GET", headers=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_injection_head_and_no_source_changes(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"/__dev_client.js", body)
        self.assertIn(b"__finjixDevPreview", body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual((self.public / "index.html").read_text(), "<body>hello</body>")
        status, headers, head = self.request("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(head, b"")
        self.assertEqual(int(headers["Content-Length"]), len(body))

    def test_directory_redirect(self):
        status, headers, _ = self.request("/folder?test=1")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/folder/?test=1")
        self.assertNotIn(b"/__dev_client.js", self.request("/folder/")[2])

    def test_static_file_ranges(self):
        data = bytes(range(256)) * 1024
        (self.public / "sample.webm").write_bytes(data)
        status, headers, body = self.request("/sample.webm")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        self.assertEqual(body, data)
        cases = [
            ("bytes=10-19", 10, 19),
            ("bytes=65530-131080", 65530, 131080),  # Cross copy-buffer boundaries.
            ("bytes=100-", 100, len(data) - 1),
            ("bytes=-12", len(data) - 12, len(data) - 1),
            ("bytes=262140-999999", 262140, len(data) - 1),
            ("bytes=-999999", 0, len(data) - 1),
        ]
        for requested, start, end in cases:
            with self.subTest(range=requested):
                status, headers, body = self.request("/sample.webm", headers={"Range": requested})
                self.assertEqual(status, 206)
                self.assertEqual(headers["Content-Range"], f"bytes {start}-{end}/{len(data)}")
                self.assertEqual(int(headers["Content-Length"]), end - start + 1)
                self.assertEqual(body, data[start:end + 1])
        status, headers, body = self.request("/sample.webm", "HEAD", {"Range": "bytes=10-19"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Length"], "10")
        self.assertEqual(body, b"")

    def test_unsatisfiable_and_unsupported_ranges(self):
        (self.public / "sample.webm").write_bytes(b"0123456789")
        for requested in ["bytes=10-", "bytes=7-3", "bytes=-0"]:
            with self.subTest(range=requested):
                status, headers, body = self.request("/sample.webm", headers={"Range": requested})
                self.assertEqual(status, 416)
                self.assertEqual(headers["Content-Range"], "bytes */10")
                self.assertEqual(body, b"")
        for requested in ["bytes=bad", "bytes=0-1,3-4", "items=0-1", "bytes=-"]:
            with self.subTest(range=requested):
                status, _, body = self.request("/sample.webm", headers={"Range": requested})
                self.assertEqual(status, 200)
                self.assertEqual(body, b"0123456789")
        status, _, body = self.request("/sample.webm", headers={"Range": "bytes=2-3", "If-Range": '"old"'})
        self.assertEqual(status, 200)
        self.assertEqual(body, b"0123456789")
        (self.public / "empty.webm").write_bytes(b"")
        self.assertEqual(self.request("/empty.webm")[0], 200)
        self.assertEqual(self.request("/empty.webm", headers={"Range": "bytes=0-"})[0], 416)

    def test_revision_changes_and_reuse_identification(self):
        url = f"http://127.0.0.1:{self.port}/"
        self.assertTrue(preview.preview_running(url))
        initial = self.request("/__dev_revision")[2]
        (self.public / "new.css").write_text("body {}")
        self.assertNotEqual(initial, self.request("/__dev_revision")[2])
        with patch.object(preview, "urlopen") as urlopen:
            response = urlopen.return_value.__enter__.return_value
            response.status = 200
            response.read.return_value = b"different-project"
            self.assertFalse(preview.preview_running(url))

    def test_manifest_tracks_added_changed_and_deleted_files(self):
        initial = json.loads(self.request("/__dev_manifest")[2])
        css = self.public / "styles.css"
        css.write_text("body {}")
        added = json.loads(self.request("/__dev_manifest")[2])
        self.assertNotEqual(initial["revision"], added["revision"])
        self.assertIn("styles.css", added["files"])
        css.write_text("body { color: red; }")
        changed = json.loads(self.request("/__dev_manifest")[2])
        self.assertNotEqual(added["files"]["styles.css"], changed["files"]["styles.css"])
        css.unlink()
        self.assertNotIn("styles.css", json.loads(self.request("/__dev_manifest")[2])["files"])
        self.assertEqual(self.request("/__dev_revision")[2].decode(), preview.revision())

    def test_dev_client_is_served_and_script_config_is_escaped(self):
        status, headers, body = self.request("/__dev_client.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn(b"/__dev_manifest", body)
        script = preview.reload_script({"files": {"</script>.css": "1"}})
        self.assertNotIn(b"</script>.css", script)
        self.assertIn(b"\\u003c/script>.css", script)

    def test_port_conflict_does_not_stop_a_process(self):
        with patch("sys.argv", ["dev-server.py", "--open-browser"]), \
             patch.object(preview, "PreviewServer", side_effect=OSError("occupied")), \
             patch.object(preview, "preview_running", return_value=False), \
             patch.object(preview.webbrowser, "open") as open_browser:
            self.assertEqual(preview.main(), 1)
            open_browser.assert_not_called()

    def test_existing_preview_is_reused(self):
        with patch("sys.argv", ["dev-server.py", "--open-browser"]), \
             patch.object(preview, "PreviewServer", side_effect=OSError("occupied")), \
             patch.object(preview, "preview_running", return_value=True), \
             patch.object(preview.webbrowser, "open") as open_browser:
            self.assertEqual(preview.main(), 0)
            open_browser.assert_called_once_with("http://127.0.0.1:8000/")


if __name__ == "__main__":
    unittest.main()
