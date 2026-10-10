# -*- coding: utf-8 -*-
"""Локальный сервер прототипа карты Яндекса (только стандартная библиотека).

Запуск из любого каталога:

    python3 experiments/yandex-map-prototype/serve.py [порт]

По адресу http://localhost:<порт>/ отдаётся ТОЛЬКО прототип и то, что он
читает: data/*.json и js/logic/*.js. Само приложение (index.html, sw.js)
по этому адресу недоступно, поэтому его Service Worker не может
зарегистрироваться на адресе прототипа и подменить страницу прототипа
кэшированным приложением.

По адресу http://127.0.0.1:<порт>/ отдаётся приложение целиком — туда ведёт
ссылка «Карточка в приложении». Для браузера это другой origin.

Файлы проекта сервер не изменяет.
"""

import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROTOTYPE = "/experiments/yandex-map-prototype/"
PROTOTYPE_ALLOWED = (PROTOTYPE, "/data/", "/js/logic/")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _is_prototype_host(self):
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host == "localhost"

    def do_GET(self):
        if self._is_prototype_host():
            path = self.path.split("?", 1)[0].split("#", 1)[0]
            if path == "/":
                self.send_response(302)
                self.send_header("Location", PROTOTYPE)
                self.end_headers()
                return
            if not path.startswith(PROTOTYPE_ALLOWED):
                self.send_error(404, "Not part of the prototype")
                return
        super().do_GET()

    def do_HEAD(self):
        if self._is_prototype_host():
            path = self.path.split("?", 1)[0].split("#", 1)[0]
            if not path.startswith(PROTOTYPE_ALLOWED):
                self.send_error(404, "Not part of the prototype")
                return
        super().do_HEAD()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    with Server(("127.0.0.1", port), Handler) as server:
        print("Прототип:   http://localhost:%d%s" % (port, PROTOTYPE))
        print("Приложение: http://127.0.0.1:%d/ (для ссылки «Карточка в приложении»)" % port)
        print("В настройках ключа в «Ограничение по HTTP Referer» должен быть localhost. Ctrl+C — остановить.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
