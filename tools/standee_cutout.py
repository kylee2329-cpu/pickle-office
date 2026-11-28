import numpy as np
from PIL import Image, ImageFilter

SRC = "/workspace/downloads/reika-standee-raw-01.png"
OUT = "/workspace/work/pickle-office/assets/standees/reika.png"
PREVIEW_W = "/workspace/downloads/preview-white.png"
PREVIEW_D = "/workspace/downloads/preview-dark.png"


def flood(passable, seeds):
    H, W = passable.shape
    filled = np.zeros_like(passable)
    stack = [(int(y), int(x)) for y, x in seeds]
    while stack:
        y, x = stack.pop()
        if filled[y, x] or not passable[y, x]:
            continue
        l = x
        while l > 0 and passable[y, l - 1] and not filled[y, l - 1]:
            l -= 1
        r = x
        while r < W - 1 and passable[y, r + 1] and not filled[y, r + 1]:
            r += 1
        filled[y, l:r + 1] = True
        for yy in (y - 1, y + 1):
            if 0 <= yy < H:
                seg = passable[yy, l:r + 1] & ~filled[yy, l:r + 1]
                if seg.any():
                    starts = np.flatnonzero(seg & np.r_[True, ~seg[:-1]]) + l
                    stack.extend((yy, int(s)) for s in starts)
    return filled


im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.float32)
h, w = a.shape[:2]
mn = a.min(axis=2)
mx = a.max(axis=2)
nw = (mn >= 242) & ((mx - mn) <= 7)

bg = flood(nw, [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)])
print("border bg fraction", round(float(bg.mean()), 4))

# 다리 사이처럼 테두리와 끊긴 흰 구멍도 큰 것만 배경으로 처리
rem = nw & ~bg
while rem.any():
    y, x = np.argwhere(rem)[0]
    comp = flood(rem, [(y, x)])
    area = int(comp.sum())
    if area > 400:
        bg |= comp
        print("cleared enclosed white pocket", area)
    rem &= ~comp

fig = Image.fromarray(((~bg) * 255).astype(np.uint8), "L")
fig = fig.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
s = np.asarray(fig).astype(np.float32) / 255.0
alpha = np.clip((s - 0.30) / 0.55, 0.0, 1.0)
alpha[s >= 0.85] = 1.0

# 실루엣 테두리에 남은 흰 테(스튜디오 배경 번짐)를 밴드 안에서만 제거
band = np.asarray(
    Image.fromarray(((~bg) * 255).astype(np.uint8), "L")
    .filter(ImageFilter.MaxFilter(5))
    .filter(ImageFilter.GaussianBlur(1.2))
).astype(np.float32) / 255.0
white = np.clip((248.0 - mn) / 22.0, 0.0, 1.0)
alpha = alpha * (1.0 - (1.0 - white) * band)
alpha[bg] = 0.0

# 경계 흰 오염 제거 (halo 완화)
af = alpha[..., None]
rgb = (a - 255.0 * (1.0 - af)) / np.maximum(af, 1e-3)
rgb = np.clip(rgb, 0, 255)
rgb = np.where(af > 0.03, rgb, a)
rgba = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)

img = Image.fromarray(rgba, "RGBA")
bbox = img.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
img = img.crop(bbox)
target_h = 900
img = img.resize((max(1, round(img.width * target_h / img.height)), target_h), Image.LANCZOS)
img.save(OUT)
print("saved", OUT, img.size)

for path, color in [(PREVIEW_W, (255, 255, 255)), (PREVIEW_D, (40, 38, 52))]:
    canvas = Image.new("RGB", (img.width + 80, img.height + 80), color)
    canvas.paste(img, (40, 40), img)
    canvas.save(path)
print("previews ok")
