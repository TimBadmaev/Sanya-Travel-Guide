# -*- coding: utf-8 -*-
"""Генератор иконок Sanya Guide (Итерация 5). Запускается один раз при
разработке: python3 tools/make_icons.py — готовые PNG лежат в assets/icons/.

Только стандартная библиотека Python, без внешних изображений (D-14, D-28).
Знак: закатное солнце над двумя волнами на лагунном фоне — те же цвета, что
акцентная полоса шапки (css/styles.css: --color-primary, #f2c15a).
В приложение и в precache этот файл не входит.
"""
import math
import os
import struct
import zlib

BG = (0x0B, 0x6E, 0x6E)      # --color-primary
SUN = (0xF2, 0xC1, 0x5A)     # закат из полосы шапки
WAVE = (0xFF, 0xFF, 0xFF)
WAVE2 = (0x9F, 0xD6, 0xCF)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "icons")
SS = 4  # суперсэмплинг по каждой оси — сглаживание краёв


def wave_y(x, base, amp, period):
    return base + amp * math.sin(2 * math.pi * (x - 0.5) / period)


def color_at(x, y, k):
    """Цвет в точке (x, y) в долях стороны; k — масштаб знака вокруг центра
    (у maskable знак меньше: безопасная зона — круг 80 % стороны)."""
    u = 0.5 + (x - 0.5) / k
    v = 0.5 + (y - 0.5) / k
    horizon = 0.585
    # Солнце: круг, видна часть над горизонтом.
    if v < horizon and (u - 0.5) ** 2 + (v - 0.47) ** 2 <= 0.205 ** 2:
        return SUN
    # Две волны: полосы толщиной t с круглыми концами.
    for base, amp, color, x0, x1 in ((0.655, 0.022, WAVE, 0.20, 0.80), (0.765, 0.022, WAVE2, 0.29, 0.71)):
        t = 0.055
        uc = min(max(u, x0), x1)
        dy = v - wave_y(uc, base, amp, 0.2)
        dx = u - uc
        if dx * dx + dy * dy <= (t / 2) ** 2:
            return color
    return BG


def render(size, k):
    rows = []
    for py in range(size):
        row = bytearray([0])  # фильтр PNG «None»
        for px in range(size):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    c = color_at((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, k)
                    r += c[0]
                    g += c[1]
                    b += c[2]
            n = SS * SS
            row += bytes((round(r / n), round(g / n), round(b / n)))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, raw):
    def chunk(tag, data):
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack("!IIBBBBB", size, size, 8, 2, 0, 0, 0)  # RGB, непрозрачная
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, k in (
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("apple-touch-icon-180.png", 180, 1.0),
        ("icon-maskable-512.png", 512, 0.78),
    ):
        write_png(os.path.join(OUT, name), size, render(size, k))
        print("OK", name)


if __name__ == "__main__":
    main()
