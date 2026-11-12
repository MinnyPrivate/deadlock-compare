"""Read-only extractor for the Compare overlay.

Reads Deadlock's pak01_dir.vpk (VPK v2) directory and copies selected panorama
image resources (raw .vtex_c / .vsvg_c bytes) plus the loose panorama font files
into one zip. Nothing in the game folder is modified.

Usage: python extract_assets.py "<Deadlock folder>" "<output zip>"
"""
import os, re, struct, sys, zipfile, json

PATTERNS = [
    r"^panorama/images/heroes/[a-z_]+_sm_psd\.vtex_c$",
    r"^panorama/images/hero_badges/hero_image_mask_psd\.vtex_c$",
    r"^panorama/images/post_game/[^/]+$",
    r"^panorama/images/hud/top_bar/coin_[a-z_]+\.vsvg_c$",
    r"^panorama/images/hud/core/icon_(team1|team2)_psd\.vtex_c$",
    r"^panorama/images/hud/(core|icons)/icon_soul\.vsvg_c$",
    r"^panorama/images/hud/icon_lane_[a-z_]+\.vsvg_c$",
    r"^panorama/images/icons/(icon_graph|icon_carat|icon_carat_right|deadlock_logo|arrow_east)\.vsvg_c$",
    r"^panorama/images/masks/dust_01_psd\.vtex_c$",
    r"^panorama/images/textures/(paper_panel_bg_01_png|paper_tile_1k_01_png)\.vtex_c$",
    r"^panorama/images/buttons/dropdown_border_png\.vtex_c$",
    r"^panorama/images/minimap/objective_icon_t[12]\.vsvg_c$",
    r"^panorama/images/hud/objectives/team[12]_patron_logo(_psd\.vtex_c|\.vsvg_c)$",
    r"^panorama/images/npcs/patron_[a-z]*_?psd\.vtex_c$",
]
RX = [re.compile(p) for p in PATTERNS]


def read_cstr(f):
    out = bytearray()
    while True:
        c = f.read(1)
        if not c or c == b"\0":
            return out.decode("utf-8", "replace")
        out += c


def walk_vpk(dir_path):
    with open(dir_path, "rb") as f:
        sig, ver, tree_size = struct.unpack("<III", f.read(12))
        if sig != 0x55AA1234:
            raise SystemExit("Not a VPK: " + dir_path)
        header = 12
        if ver == 2:
            f.read(16)
            header = 28
        data_start = header + tree_size
        while True:
            ext = read_cstr(f)
            if not ext:
                break
            while True:
                path = read_cstr(f)
                if not path:
                    break
                while True:
                    name = read_cstr(f)
                    if not name:
                        break
                    crc, preload, arch, off, length, term = struct.unpack("<IHHIIH", f.read(18))
                    pre = f.read(preload)
                    full = ("" if path.strip() == "" else path + "/") + name + "." + ext
                    yield full, arch, off, length, pre, data_start


def main():
    game = sys.argv[1]
    out_zip = sys.argv[2]
    citadel = os.path.join(game, "game", "citadel")
    dir_vpk = os.path.join(citadel, "pak01_dir.vpk")
    picked = []
    for full, arch, off, length, pre, data_start in walk_vpk(dir_vpk):
        if any(r.match(full) for r in RX):
            picked.append((full, arch, off, length, pre, data_start))
    report = {"files": [], "fonts": []}
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for full, arch, off, length, pre, data_start in picked:
            data = pre
            if length:
                if arch == 0x7FFF:
                    src, pos = dir_vpk, data_start + off
                else:
                    src, pos = os.path.join(citadel, "pak01_%03d.vpk" % arch), off
                with open(src, "rb") as a:
                    a.seek(pos)
                    data += a.read(length)
            z.writestr(full, data)
            report["files"].append([full, len(data)])
        fonts = os.path.join(citadel, "panorama", "fonts")
        if os.path.isdir(fonts):
            for root, _, files in os.walk(fonts):
                for fn in files:
                    p = os.path.join(root, fn)
                    rel = os.path.relpath(p, citadel).replace("\\", "/")
                    z.write(p, rel)
                    report["fonts"].append([rel, os.path.getsize(p)])
        z.writestr("report.json", json.dumps(report, indent=1))
    print("images/svgs:", len(report["files"]), " font files:", len(report["fonts"]))
    print("wrote", out_zip)


if __name__ == "__main__":
    main()
