#!/usr/bin/env python3
"""
Подготовка рамок аватара для магазина кастомизации из картинок нейросети.

Рамка в лаунчере ложится поверх всего аватара (см. src/components/AvatarFrame.tsx), поэтому нужен
квадратный файл с прозрачной серединой. Скрипт:
  1. убирает сплошной фон (белый, зелёный и т. п.), если картинка не прозрачная, и счищает
     цветную кайму с краёв;
  2. обрезает пустые поля и выставляет рамку по центру квадрата;
  3. приводит к одному размеру;
  4. вырезает середину под аватар;
  5. предупреждает, если от рамки почти ничего не осталось.

Запуск (нужен Pillow: pip install pillow):
  python scripts/prepare-frames.py ./из-нейросети -o ./frames --preview
  python scripts/prepare-frames.py frame1.png frame2.webp --border 0.16 --shape circle
  python scripts/prepare-frames.py ./pixel-frames --pixel --size 256

Анимированные файлы не обрабатываются: скрипт пропускает их с сообщением.
"""
import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

INPUT_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
PREVIEW_SIZES = {128: 16, 112: 12.8, 64: 9.6, 40: 4.8, 16: 3}  # размер аватара в лаунчере: радиус скругления
OPAQUE = 10  # альфа, начиная с которой пиксель считается частью рамки
FRINGE_RINGS = 2  # сколько пикселей у края фона очищать от его цвета


def dist(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def background_color(img):
    """Цвет фона по четырём углам; None — углы разные, фон не сплошной."""
    w, h = img.size
    px = img.load()
    r = max(2, min(w, h) // 64)
    corners = []
    for cx, cy in ((0, 0), (w - r, 0), (0, h - r), (w - r, h - r)):
        patch = sorted(px[x, y][:3] for x in range(cx, cx + r) for y in range(cy, cy + r))
        corners.append(patch[len(patch) // 2])
    if any(dist(corners[0], c) > 40 for c in corners[1:]):
        return None
    return tuple(sorted(c[i] for c in corners)[1] for i in range(3))


def already_transparent(img):
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    return sum(1 for c in corners if c[3] < OPAQUE) >= 3


def remove_background(img, bg, tolerance):
    """Заливка от краёв и от центра: внутри кольца фон не соединён с внешним."""
    w, h = img.size
    px = img.load()
    is_bg = bytearray(w * h)
    queue = deque()

    def seed(x, y):
        if not is_bg[y * w + x] and dist(px[x, y], bg) <= tolerance:
            is_bg[y * w + x] = 1
            queue.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)
    # начинаем не только из точки центра: там может оказаться случайное пятнышко
    span = max(1, min(w, h) // 16)
    for y in range(h // 2 - span, h // 2 + span + 1):
        for x in range(w // 2 - span, w // 2 + span + 1):
            seed(x, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                seed(nx, ny)

    # Кайма: пиксели у границы смешаны с цветом фона. Считаем их прозрачность по близости
    # к фону и вычитаем его цвет, иначе вокруг рамки останется ореол.
    band = [i for i in range(w * h) if is_bg[i]]
    seen = bytearray(is_bg)
    soft_range = max(tolerance * 3, 90)
    for _ in range(FRINGE_RINGS):
        next_band = []
        for i in band:
            x, y = i % w, i // w
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                    seen[ny * w + nx] = 1
                    next_band.append(ny * w + nx)
        for i in next_band:
            x, y = i % w, i // w
            r, g, b, a0 = px[x, y]
            a = min(1.0, max(0.0, (dist((r, g, b), bg) - tolerance) / (soft_range - tolerance)))
            if a <= 0.02:
                px[x, y] = (0, 0, 0, 0)
                continue
            clean = [min(255, max(0, round((c - (1 - a) * b0) / a))) for c, b0 in zip((r, g, b), bg)]
            px[x, y] = (*clean, round(a * a0))
        band = next_band

    for i, flag in enumerate(is_bg):
        if flag:
            px[i % w, i // w] = (0, 0, 0, 0)
    return img


def trim_to_square(img):
    """Обрезает пустые поля и ставит рамку по центру квадрата."""
    box = img.getchannel("A").point(lambda a: 255 if a >= OPAQUE else 0).getbbox()
    if not box:
        return None
    img = img.crop(box)
    side = max(img.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return square


def hole_mask(size, border, shape):
    """Маска выреза со сглаженным краем: рисуем крупнее и уменьшаем."""
    scale = 4
    big = size * scale
    m = round(big * border)
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    if shape == "circle":
        draw.ellipse((m, m, big - m - 1, big - m - 1), fill=255)
    else:
        # скругление как у аватара в лаунчере (0.8rem при стороне 112 px)
        draw.rounded_rectangle((m, m, big - m - 1, big - m - 1), radius=round(big * 0.114), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def cut_hole(img, border, shape, pixel):
    mask = hole_mask(img.width, border, shape)
    if pixel:
        mask = mask.point(lambda v: 255 if v >= 128 else 0)
    alpha = img.getchannel("A")
    img.putalpha(Image.composite(Image.new("L", img.size, 0), alpha, mask))
    return img, mask


def coverage(img, mask):
    """Какая доля области вокруг выреза занята рамкой."""
    alpha = img.getchannel("A").tobytes()
    hole = mask.tobytes()
    ring = hole.count(0)
    return sum(1 for a, h in zip(alpha, hole) if h == 0 and a >= OPAQUE) / max(1, ring)


def sample_avatar(size, radius):
    """Заглушка аватара: скруглённый градиент с тем же отступом, что и в AvatarFrame."""
    inset = 2 if size <= 16 else 3
    inner = size - inset * 2
    grad = Image.linear_gradient("L").resize((inner, inner))
    avatar = ImageOps.colorize(grad, "#3a7bd5", "#e0569b").convert("RGBA")
    mask = Image.new("L", (inner * 4, inner * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner * 4 - 1, inner * 4 - 1), radius=round(radius * 4), fill=255)
    avatar.putalpha(mask.resize((inner, inner), Image.LANCZOS))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(avatar, (inset, inset))
    return canvas


def make_preview(frame, path, pixel):
    gap = 16
    width = sum(PREVIEW_SIZES) + gap * (len(PREVIEW_SIZES) + 1)
    sheet = Image.new("RGBA", (width, max(PREVIEW_SIZES) + gap * 2), (11, 10, 18, 255))
    x = gap
    for size, radius in PREVIEW_SIZES.items():
        avatar = sample_avatar(size, radius)
        small = frame.resize((size, size), Image.NEAREST if pixel else Image.LANCZOS)
        avatar.alpha_composite(small)
        sheet.alpha_composite(avatar, (x, (sheet.height - size) // 2))
        x += size + gap
    sheet.convert("RGB").save(path)


def process(path, out_dir, args):
    src = Image.open(path)
    if getattr(src, "is_animated", False):
        return "пропущен: анимированный файл, обрабатываются только статичные"
    img = ImageOps.exif_transpose(src).convert("RGBA")
    notes = []

    if not already_transparent(img):
        bg = background_color(img)
        if bg is None:
            return "пропущен: фон не сплошной (углы разного цвета). Сгенерируйте рамку на однотонном фоне"
        img = remove_background(img, bg, args.tolerance)
        notes.append("фон убран")

    if not args.no_trim:
        img = trim_to_square(img)
        if img is None:
            return "пропущен: после удаления фона ничего не осталось"
    elif img.width != img.height:
        side = max(img.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        img = square

    img = img.resize((args.size, args.size), Image.NEAREST if args.pixel else Image.LANCZOS)
    img, mask = cut_hole(img, args.border, args.shape, args.pixel)

    share = coverage(img, mask)
    if share < 0.25:
        notes.append(f"ВНИМАНИЕ: рамка занимает только {share:.0%} края, проверьте результат или уменьшите --border")

    target = out_dir / f"{path.stem}.png"
    if target in args.written:
        return f"пропущен: {target.name} уже записан из файла с таким же именем в этом запуске, переименуйте один из них"
    args.written.add(target)
    img.save(target, optimize=True)
    if args.preview:
        make_preview(img, out_dir / f"{path.stem}.preview.png", args.pixel)
    return f"готово: {target}" + (f" ({'; '.join(notes)})" if notes else "")


def main():
    p = argparse.ArgumentParser(description="Подготовка рамок аватара для магазина кастомизации")
    p.add_argument("inputs", nargs="+", type=Path, help="файлы или папки с картинками")
    p.add_argument("-o", "--out", type=Path, default=Path("frames-out"), help="куда сохранять (по умолчанию frames-out)")
    p.add_argument("--size", type=int, default=512, help="сторона рамки в пикселях (по умолчанию 512)")
    p.add_argument("--border", type=float, default=0.12, help="ширина рамки как доля стороны, 0.02–0.45 (по умолчанию 0.12)")
    p.add_argument("--shape", choices=("rounded", "circle"), default="rounded", help="форма выреза (по умолчанию как у аватара)")
    p.add_argument("--tolerance", type=int, default=32, help="насколько цвет может отличаться от фона (по умолчанию 32)")
    p.add_argument("--pixel", action="store_true", help="пиксельная графика: масштаб без сглаживания")
    p.add_argument("--no-trim", action="store_true", help="не обрезать поля (рамка уже по центру квадрата)")
    p.add_argument("--preview", action="store_true", help="сохранить превью на аватаре в размерах лаунчера")
    args = p.parse_args()

    if not 0.02 <= args.border <= 0.45:
        p.error("--border должен быть от 0.02 до 0.45")
    if args.size < 16:
        p.error("--size должен быть не меньше 16")

    files = []
    for item in args.inputs:
        if item.is_dir():
            files += sorted(f for f in item.iterdir() if f.suffix.lower() in INPUT_EXT and not f.stem.endswith(".preview"))
        elif item.is_file():
            files.append(item)
        else:
            print(f"{item}: файл не найден", file=sys.stderr)
    if not files:
        p.error("нет подходящих картинок (png, jpg, webp, bmp)")

    args.out.mkdir(parents=True, exist_ok=True)
    args.written = set()
    failed = 0
    for f in files:
        try:
            result = process(f, args.out, args)
        except Exception as err:  # один битый файл не должен останавливать всю пачку
            result = f"пропущен: не удалось обработать ({err})"
        failed += result.startswith("пропущен")
        print(f"{f.name}: {result}")
    print(f"Обработано: {len(files) - failed} из {len(files)}")
    return 1 if failed == len(files) else 0


if __name__ == "__main__":
    sys.exit(main())
