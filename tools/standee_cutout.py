"""3등신 피규어 원본(PNG)에서 순백 배경을 떼어 투명 스탠드 PNG를 만듭니다.

사용 예:
  python3 tools/standee_cutout.py --src downloads/chibi-kyle-raw.png \
      --out work/pickle-office/assets/standees/kyle.png
  python3 tools/standee_cutout.py --all      # 6인 일괄

옵션 없이 실행하면 예전처럼 레이카 샘플 경로를 씁니다.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ASSETS = os.path.join(ROOT, 'work', 'pickle-office', 'assets')

DEFAULT_SRC = os.path.join(ROOT, 'downloads', 'reika-chibi-sample.png')
DEFAULT_OUT = os.path.join(ASSETS, 'standees', 'reika.png')

# 6인 기본 경로 (--all)
JOBS = {
    'kyle': ('downloads/chibi-kyle-raw.png', 'assets/standees/kyle.png'),
    'cloie': ('downloads/chibi-cloie-raw.png', 'assets/standees/cloie.png'),
    'aika': ('downloads/chibi-aika-raw.png', 'assets/standees/aika.png'),
    'peika': ('downloads/chibi-peika-raw.png', 'assets/standees/peika.png'),
    'reika': ('downloads/reika-chibi-sample.png', 'assets/standees/reika.png'),
    'seika': ('downloads/chibi-seika-raw.png', 'assets/standees/seika.png'),
}

TARGET_H = 900


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


def cutout(src, out, preview_dir=None):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    mn = a.min(axis=2)
    mx = a.max(axis=2)
    nw = (mn >= 242) & ((mx - mn) <= 7)

    bg = flood(nw, [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)])
    print(os.path.basename(src), 'size', (w, h), 'border bg fraction', round(float(bg.mean()), 4))

    # 다리 사이처럼 테두리와 끊긴 흰 구멍도 큰 것만 배경으로 처리
    rem = nw & ~bg
    while rem.any():
        y, x = np.argwhere(rem)[0]
        comp = flood(rem, [(y, x)])
        area = int(comp.sum())
        if area > 400:
            bg |= comp
            print('  cleared enclosed white pocket', area)
        rem &= ~comp

    fig = Image.fromarray(((~bg) * 255).astype(np.uint8), 'L')
    fig = fig.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(0.9))
    s = np.asarray(fig).astype(np.float32) / 255.0
    alpha = np.clip((s - 0.35) / 0.45, 0.0, 1.0)
    alpha[bg] = 0.0

    # 경계 흰 오염 제거 (halo 완화)
    af = alpha[..., None]
    rgb = (a - 255.0 * (1.0 - af)) / np.maximum(af, 1e-3)
    rgb = np.clip(rgb, 0, 255)

    # 알파 블리드: 투명 픽셀의 RGB를 가까운 실루엣 색으로 채워 GPU 보간 시 흰 테가 생기지 않게
    known = alpha > 0.35
    for _ in range(14):
        grew = known.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sr = np.roll(rgb, (dy, dx), axis=(0, 1))
            sm = np.roll(known, (dy, dx), axis=(0, 1))
            take = (~known) & sm
            rgb[take] = sr[take]
            grew |= sm
        known = grew
        if known.all():
            break

    rgba = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)

    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    print('  bbox', bbox, '-> keeps margin L/T/R/B',
          bbox[0], bbox[1], w - bbox[2], h - bbox[3])
    img = img.crop(bbox)
    img = img.resize((max(1, round(img.width * TARGET_H / img.height)), TARGET_H), Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print('  saved', os.path.relpath(out, ROOT), img.size, 'aspect', round(img.width / img.height, 4))

    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        stem = os.path.splitext(os.path.basename(out))[0]
        for suffix, color in (('white', (255, 255, 255)), ('dark', (40, 38, 52))):
            canvas = Image.new('RGB', (img.width + 60, img.height + 60), color)
            canvas.paste(img, (30, 30), img)
            p = os.path.join(preview_dir, f'preview-{stem}-{suffix}.png')
            canvas.save(p)
    return img.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src')
    ap.add_argument('--out')
    ap.add_argument('--preview-dir')
    ap.add_argument('--all', action='store_true')
    args = ap.parse_args()

    if args.all:
        for cid, (rel_src, rel_out) in JOBS.items():
            cutout(os.path.join(ROOT, rel_src), os.path.join(ASSETS, rel_out.replace('assets/', '', 1)),
                   args.preview_dir)
        return
    src = args.src or DEFAULT_SRC
    out = args.out or DEFAULT_OUT
    cutout(src, out, args.preview_dir)


if __name__ == '__main__':
    main()
