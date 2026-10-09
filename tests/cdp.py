# -*- coding: utf-8 -*-
"""Минимальный клиент Chrome DevTools Protocol на стандартной библиотеке Python.

Проверки проекта идут в настоящем headless Chrome: Node и сторонних пакетов в
среде разработки нет (README.md, «Проверки»). Модуль даёт:
  * serve(root, port) — статический сервер проекта (многопоточный, с большой
    очередью: однопоточный http.server роняет параллельные ES-модули);
  * Browser — запуск Chrome с чистым профилем и одна вкладка с CDP-сессией.
В приложение не входит и не публикуется.
"""

import base64
import http.server
import json
import os
import shutil
import socket
import socketserver
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request

CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128

    def handle_error(self, request, client_address):
        # Браузер обрывает запросы при холодной навигации — это не ошибка.
        import sys as _sys
        if not isinstance(_sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


def serve(root, port):
    """Запускает сервер в фоне; возвращает объект с .shutdown()."""
    handler = lambda *a, **kw: _Handler(*a, directory=root, **kw)  # noqa: E731
    server = _Server(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _WebSocket:
    def __init__(self, url):
        assert url.startswith("ws://")
        rest = url[5:]
        hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("websocket handshake failed")
            buf += chunk
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        data = text.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise RuntimeError("websocket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        message = b""
        while True:
            b1, b2 = self._read(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            opcode = b1 & 0x0F
            if opcode == 0x8:
                raise RuntimeError("websocket closed by peer")
            if opcode in (0x9, 0xA):
                continue
            message += payload
            if b1 & 0x80:
                return message.decode("utf-8", "replace")


class Browser:
    """Headless Chrome с чистым профилем и одной вкладкой.

    Каждый экземпляр — новый профиль: Service Worker и localStorage прошлого
    запуска не мешают (кэш SW иначе отдаёт старый код)."""

    def __init__(self, width=375, height=667, mobile=True):
        self.profile = tempfile.mkdtemp(prefix="sanya-cdp-")
        self.port = _free_port()
        self.proc = subprocess.Popen(
            [
                CHROME,
                "--headless=new",
                f"--remote-debugging-port={self.port}",
                f"--user-data-dir={self.profile}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-gpu",
                "--disable-extensions",
                "--hide-scrollbars",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        targets = None
        for _ in range(300):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json") as r:
                    targets = json.load(r)
                if any(t.get("type") == "page" for t in targets):
                    break
            except Exception:
                pass
            time.sleep(0.1)
        if not targets:
            raise RuntimeError("chrome devtools http not up")
        page = next(t for t in targets if t.get("type") == "page")
        self.ws = _WebSocket(page["webSocketDebuggerUrl"])
        self.next_id = 0
        self.events = []
        self.console = []
        self.exceptions = []
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("Network.enable")
        self.send("Network.setCacheDisabled", {"cacheDisabled": True})
        self.set_viewport(width, height, mobile)

    def send(self, method, params=None, timeout=30):
        self.next_id += 1
        my_id = self.next_id
        self.ws.send(json.dumps({"id": my_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == my_id:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self._event(msg)
        raise TimeoutError(method)

    def _event(self, msg):
        method = msg.get("method")
        if method == "Runtime.consoleAPICalled":
            args = msg["params"].get("args", [])
            text = " ".join(str(a.get("value", a.get("description", ""))) for a in args)
            self.console.append((msg["params"]["type"], text))
        elif method == "Runtime.exceptionThrown":
            details = msg["params"]["exceptionDetails"]
            self.exceptions.append(details.get("exception", {}).get("description") or details.get("text"))
        else:
            self.events.append(msg)

    def set_viewport(self, width, height, mobile=True):
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {"width": width, "height": height, "deviceScaleFactor": 2, "mobile": mobile},
        )

    def js(self, expression, await_promise=True):
        """Выполняет выражение в странице и возвращает значение (JSON)."""
        res = self.send(
            "Runtime.evaluate",
            {"expression": expression, "awaitPromise": await_promise, "returnByValue": True},
        )
        if "exceptionDetails" in res:
            desc = res["exceptionDetails"].get("exception", {}).get("description") or res["exceptionDetails"].get("text")
            raise RuntimeError(f"JS error: {desc}\n--- in: {expression[:300]}")
        return res.get("result", {}).get("value")

    def add_init_script(self, source):
        return self.send("Page.addScriptToEvaluateOnNewDocument", {"source": source})["identifier"]

    def remove_init_script(self, identifier):
        self.send("Page.removeScriptToEvaluateOnNewDocument", {"identifier": identifier})

    def navigate(self, url, wait=True):
        self.send("Page.navigate", {"url": url})
        if wait:
            self.wait_ready()

    def wait_for(self, expression, timeout=10):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.js(expression):
                    return True
            except RuntimeError:
                pass
            time.sleep(0.05)
        return False

    def wait_ready(self, timeout=10):
        """Ждёт, пока экран дорисуется: в #view есть содержимое и нет .loading."""
        return self.wait_for(
            "document.readyState === 'complete' && !!document.querySelector('#view') && "
            "document.querySelector('#view').children.length > 0 && !document.querySelector('#view .loading')",
            timeout,
        )

    def go(self, base, hash_, cold=False):
        """Переход по hash. cold=True — через about:blank (новая загрузка)."""
        if cold:
            self.navigate("about:blank", wait=False)
            time.sleep(0.05)
            self.navigate(base + "index.html" + hash_)
            self.send("Page.resetNavigationHistory")
        else:
            self.js(f"window.location.hash = {json.dumps(hash_)}; true")
            time.sleep(0.05)
            self.wait_ready()

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)
