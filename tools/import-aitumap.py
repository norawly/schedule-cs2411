#!/usr/bin/env python3
"""Импорт карты корпуса C1 из репозитория aitumap (Yuujiso/aitumap) в public/map/floors.json.

Забирает:
  • кабинеты  — <g data-name="C1.3.267P"> с контуром-полигоном;
  • зоны      — санузлы, техпомещения, лестницы, выходы, спортзал (группы map-groups-*);
  • контур здания и крупные подписи блоков (Wallpaper.jsx);
  • иконки    — санузлы (IconsCommon), лестницы (Stairs), эвакуационные выходы (IconsEscapes*).
"""
import json, re, sys, os
import xml.etree.ElementTree as ET

SRC  = sys.argv[1] if len(sys.argv) > 1 else "aitumap/src/shared/ui"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "public/map/floors.json"
VIEWBOX = [0, 0, 924.69, 396.16]
FLOORS  = [("C1_ALL_1.jsx", 1), ("C1_ALL_2.jsx", 2), ("C1_ALL_3.jsx", 3)]

def to_xml(src, root_tag="<g "):
    i = src.find(root_tag)
    j = src.rfind("</g>")
    body = src[i:j + 4]
    body = body.replace("className=", "class=")
    body = re.sub(r"<[A-Z][A-Za-z0-9_]*[^>]*/>", "", body)
    body = re.sub(r"</?[A-Z][A-Za-z0-9_]*[^>]*>", "", body)
    body = re.sub(r"\{[^{}]*\}", "", body)
    return "<root>" + body + "</root>"

def pts(s):
    n = [float(x) for x in re.split(r"[\s,]+", (s or "").strip()) if x]
    return [[round(n[k], 2), round(n[k + 1], 2)] for k in range(0, len(n) - 1, 2)]

def grp(el, parents):
    for node in reversed(parents + [el]):
        c = node.get("class") or ""
        m = re.search(r"map-groups-([a-z-]+)", c)
        if m:
            return m.group(1)
    return ""

# ---------- этажи ----------
def walk(el, parents, floor):
    name = el.get("data-name") or el.get("id")
    tag = el.tag.split("}")[-1]

    if tag == "g" and name and re.search(r"[A-ZА-Я0-9]", name) and name != "BLOCKS" \
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
            alt = [x.strip() for x in parts[1:] if x.strip()]
            kind = grp(el, parents) or "rooms"
            floor["rooms"].append({
                "id": parts[0].strip(),
                "title": alt[0].capitalize() if alt else "",
                "alt": alt[1:],
                "kind": {"rooms": "rooms", "wcs": "wcs", "techs": "techs",
                         "escapes": "escapes", "gym": "gym"}.get(kind, kind),
                "poly": outline})
            return

    if tag in ("polygon", "polyline") and el.get("points"):
        p = pts(el.get("points"))
        if len(p) >= 2:
            floor["zones"].append({"k": grp(el, parents), "closed": tag == "polygon", "p": p})
    elif tag == "line":
        try:
            floor["zones"].append({"k": grp(el, parents), "closed": False,
                "p": [[round(float(el.get("x1")), 2), round(float(el.get("y1")), 2)],
                      [round(float(el.get("x2")), 2), round(float(el.get("y2")), 2)]]})
        except (TypeError, ValueError):
            pass

    for ch in list(el):
        walk(ch, parents + [el], floor)

# ---------- «сырые» слои: контур, подписи, иконки ----------
def raw_groups(text, kind, root_tag="<g "):
    """иконки: <g class="map-groups-*-icon"><path подложка/><path глиф/></g>"""
    root = ET.fromstring(to_xml(text, root_tag))
    out = []
    def rec(el, parents):
        cls = el.get("class") or ""
        if el.tag.split("}")[-1] == "g" and "-icon" in cls:
            paths = [{"d": ch.get("d"), "t": ch.get("transform")}
                     for ch in el.iter() if ch.tag.split("}")[-1] == "path" and ch.get("d")]
            if paths:
                m = re.search(r"map-groups-([a-z]+)-icon", cls)
                out.append({"k": m.group(1) if m else kind, "paths": paths})
            return
        for ch in list(el):
            rec(ch, parents + [el])
    for ch in list(root):
        rec(ch, [root])
    return out

def raw_paths(text, want_class=None, root_tag="<g "):
    root = ET.fromstring(to_xml(text, root_tag))
    out = []
    def rec(el, parents):
        tag = el.tag.split("}")[-1]
        cls = el.get("class") or grp(el, parents)
        if tag == "path" and el.get("d"):
            if want_class is None or want_class in (el.get("class") or "") or want_class in cls:
                out.append({"d": el.get("d"), "t": el.get("transform"), "k": cls or ""})
        elif tag in ("polygon", "polyline") and el.get("points"):
            out.append({"p": pts(el.get("points")), "closed": tag == "polygon", "k": cls or grp(el, parents)})
        for ch in list(el):
            rec(ch, parents + [el])
    for ch in list(root):
        rec(ch, [root])
    return out

def read(*parts):
    return open(os.path.join(SRC, *parts), encoding="utf-8").read()

wall = read("general", "map", "Wallpaper.jsx")
building = [x for x in raw_paths(wall) if x.get("k") == "bg" or 'class="bg"' in wall[:0]]
building = [{"d": x["d"], "t": x.get("t")} for x in raw_paths(wall) if x.get("k") == "bg"]
labels   = [{"d": x["d"], "t": x.get("t")} for x in raw_paths(wall) if "label" in (x.get("k") or "")]

wc_icons = raw_groups(read("general", "map", "IconsCommon.jsx"), "wcs")

stairs_src = read("general", "map", "Stairs.jsx")
default_stairs = stairs_src[stairs_src.index("const DefaultStairs"):stairs_src.index("const FillStairs")]
fill_stairs    = stairs_src[stairs_src.index("const FillStairs"):stairs_src.index("const Stairs =")]
def stairs_of(src):
    """в Stairs.jsx иконка — вложенная группа, состоящая только из path"""
    root = ET.fromstring(to_xml(src))
    icons, shapes = [], []
    def rec(el):
        tag = el.tag.split("}")[-1]
        kids = list(el)
        if tag == "g" and kids:
            paths = [c for c in kids if c.tag.split("}")[-1] == "path" and c.get("d")]
            if paths and len(paths) == len(kids):
                icons.append({"k": "stairs", "paths": [{"d": c.get("d"), "t": c.get("transform")}
                                                       for c in paths]})
                return
        if tag in ("polygon", "polyline") and el.get("points"):
            shapes.append({"k": "stairs", "closed": tag == "polygon", "p": pts(el.get("points"))})
        for ch in kids:
            rec(ch)
    for ch in list(root):
        rec(ch)
    return icons, shapes
stairs_icons, stairs_zones = {}, {}
stairs_icons[1], stairs_zones[1] = stairs_of(fill_stairs)
stairs_icons[2], stairs_zones[2] = stairs_of(default_stairs)
stairs_icons[3], stairs_zones[3] = stairs_icons[2], stairs_zones[2]

esc12 = raw_groups(read("general", "map", "IconsEscapesFirstSecond.jsx"), "escapes")
esc3_src = read("general", "map", "IconsEscapesSecondThird.jsx")
esc3_src = re.sub(r"\{!isThird &&[\s\S]*?\)\}", "", esc3_src)          # блок только для 2 этажа
esc3 = raw_groups(esc3_src, "escapes")
escapes_by_floor = {1: esc12, 2: esc12, 3: esc3}

data = {"viewBox": VIEWBOX, "source": "github.com/Yuujiso/aitumap",
        "common": {"building": building, "labels": labels}, "floors": []}

for fname, level in FLOORS:
    root = ET.fromstring(to_xml(read("others", fname)))
    floor = {"level": level, "rooms": [], "zones": [], "icons": []}
    for ch in list(root):
        walk(ch, [root], floor)
    best = {}
    for r in floor["rooms"]:
        cur = best.get(r["id"])
        if not cur or len(r["poly"]) > len(cur["poly"]):
            best[r["id"]] = r
    floor["rooms"] = sorted(best.values(), key=lambda r: r["id"])
    floor["icons"] = wc_icons + stairs_icons[level] + escapes_by_floor[level]
    floor["zones"] += stairs_zones[level]
    data["floors"].append(floor)
    print(f"этаж {level}: кабинетов {len(floor['rooms'])}, зон {len(floor['zones'])}, "
          f"иконок {len(floor['icons'])}")

print(f"контур здания: {len(building)} · подписи блоков: {len(labels)}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("→", OUT, os.path.getsize(OUT) // 1024, "KB")
