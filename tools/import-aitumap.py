#!/usr/bin/env python3
"""Импорт планов этажей из репозитория aitumap (Yuujiso/aitumap) в наш JSON.

Исходник — React-компоненты с SVG внутри: комнаты лежат в <g data-name="C1.3.267P">,
контур комнаты — первый <polygon>/<polyline>, остальные <path> — векторный текст подписи.
"""
import json, re, sys, os
import xml.etree.ElementTree as ET

SRC = sys.argv[1] if len(sys.argv) > 1 else "aitumap/src/shared/ui/others"
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/map/floors.json"
FILES = [("C1_ALL_1.jsx", 1), ("C1_ALL_2.jsx", 2), ("C1_ALL_3.jsx", 3)]
VIEWBOX = [0, 0, 924.69, 396.16]

def to_xml(src):
    """JSX → XML: оставляем только разметку внутри корневого <g>."""
    i = src.find("<g ")
    j = src.rfind("</g>")
    body = src[i:j + 4]
    body = body.replace("className=", "class=")
    body = re.sub(r"<[A-Z][A-Za-z0-9_]*[^>]*/>", "", body)          # <Stairs isFirst />
    body = re.sub(r"</?[A-Z][A-Za-z0-9_]*[^>]*>", "", body)          # <MapLayout> ... </MapLayout>
    body = re.sub(r"\{[^{}]*\}", "", body)                           # JSX-выражения
    return "<root>" + body + "</root>"

def pts(s):
    n = [float(x) for x in re.split(r"[\s,]+", (s or "").strip()) if x]
    return [[round(n[k], 2), round(n[k + 1], 2)] for k in range(0, len(n) - 1, 2)]

def group_class(el, parents):
    """ближайший класс map-groups-* вверх по дереву"""
    for node in reversed(parents + [el]):
        c = node.get("class") or ""
        m = re.search(r"map-groups-([a-z-]+)", c)
        if m:
            return m.group(1)
    return ""

def walk(el, parents, floor):
    name = el.get("data-name") or el.get("id")
    tag = el.tag.split("}")[-1]

    if tag == "g" and name and re.search(r"[A-ZА-Я0-9]", name) and name not in ("BLOCKS",) \
       and not re.match(r"^(FIRST|SECOND|THIRD)_FLOOR$", name) and not re.match(r"^C1\.\d$", name):
        outline = None
        for ch in el.iter():
            t = ch.tag.split("}")[-1]
            if t in ("polygon", "polyline") and ch.get("points"):
                p = pts(ch.get("points"))
                if len(p) >= 3 and (outline is None or len(p) > len(outline)):
                    outline = p
        if outline:
            parts = name.split("|")
            rid = parts[0].strip()
            alt = [x.strip() for x in parts[1:] if x.strip()]
            floor["rooms"].append({
                "id": rid,
                "title": alt[0].capitalize() if alt else "",
                "alt": alt[1:],
                "kind": group_class(el, parents) or "rooms",
                "poly": outline
            })
            return                                   # внутрь комнаты не идём

    if tag in ("polygon", "polyline") and el.get("points"):
        p = pts(el.get("points"))
        if len(p) >= 2:
            floor["shapes"].append({"k": group_class(el, parents), "p": p,
                                    "closed": tag == "polygon"})
    elif tag == "line":
        try:
            floor["shapes"].append({"k": group_class(el, parents), "closed": False,
                "p": [[round(float(el.get("x1")), 2), round(float(el.get("y1")), 2)],
                      [round(float(el.get("x2")), 2), round(float(el.get("y2")), 2)]]})
        except (TypeError, ValueError):
            pass

    for ch in list(el):
        walk(ch, parents + [el], floor)

data = {"viewBox": VIEWBOX, "source": "github.com/Yuujiso/aitumap", "floors": []}
for fname, level in FILES:
    path = os.path.join(SRC, fname)
    root = ET.fromstring(to_xml(open(path, encoding="utf-8").read()))
    floor = {"level": level, "rooms": [], "shapes": []}
    for ch in list(root):
        walk(ch, [root], floor)
    # дубликаты id — оставляем самый крупный контур
    best = {}
    for r in floor["rooms"]:
        cur = best.get(r["id"])
        if not cur or len(r["poly"]) > len(cur["poly"]):
            best[r["id"]] = r
    floor["rooms"] = sorted(best.values(), key=lambda r: r["id"])
    data["floors"].append(floor)
    print(f"этаж {level}: комнат {len(floor['rooms'])}, линий подложки {len(floor['shapes'])}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("→", OUT, os.path.getsize(OUT) // 1024, "KB")
