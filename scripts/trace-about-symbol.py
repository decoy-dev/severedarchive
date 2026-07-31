#!/usr/bin/env python3
"""Trace the supplied monochrome About symbol into an extrusion-ready SVG."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2


def contour_path(contour, offset_x: float, offset_y: float, scale: float) -> str:
    points = contour.reshape(-1, 2)
    first_x = (float(points[0][0]) - offset_x) * scale
    first_y = (float(points[0][1]) - offset_y) * scale
    commands = [f"M {first_x:.3f} {first_y:.3f}"]
    commands.extend(
        f"L {(float(x) - offset_x) * scale:.3f} {(float(y) - offset_y) * scale:.3f}"
        for x, y in points[1:]
    )
    commands.append("Z")
    return " ".join(commands)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--width", type=float, default=540.0)
    parser.add_argument("--padding", type=float, default=24.0)
    parser.add_argument("--epsilon", type=float, default=0.8)
    args = parser.parse_args()

    source = cv2.imread(str(args.input), cv2.IMREAD_GRAYSCALE)
    if source is None:
        raise SystemExit(f"Could not read {args.input}")

    threshold, mask = cv2.threshold(
        source, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if abs(cv2.contourArea(c)) >= 6]
    contours = [cv2.approxPolyDP(c, args.epsilon, True) for c in contours]

    ys, xs = (mask > 0).nonzero()
    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    source_width = max_x - min_x
    scale = args.width / source_width
    content_height = (max_y - min_y) * scale
    view_width = args.width + 2 * args.padding
    view_height = content_height + 2 * args.padding
    offset_x = min_x - args.padding / scale
    offset_y = min_y - args.padding / scale
    path_data = " ".join(contour_path(c, offset_x, offset_y, scale) for c in contours)

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<!--
  Extrusion source for the severedarchive About-page ASCII object.
  Traced from the supplied 1080px monochrome reference with OpenCV.
  Otsu threshold: {threshold:.0f}; contour epsilon: {args.epsilon:.1f}px; regions: {len(contours)}.
-->
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {view_width:.3f} {view_height:.3f}"
     role="img"
     aria-labelledby="title desc">
  <title id="title">Hands presenting a floppy disk with an upload arrow</title>
  <desc id="desc">A monochrome mark traced as a compound path for three-dimensional extrusion.</desc>
  <path d="{path_data}" fill="#000000" fill-rule="evenodd" clip-rule="evenodd"/>
</svg>
'''
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(svg, encoding="utf-8")
    print(
        f"Wrote {args.output} ({len(contours)} contours, "
        f"{sum(len(c) for c in contours)} points, viewBox {view_width:.1f}×{view_height:.1f})"
    )


if __name__ == "__main__":
    main()
