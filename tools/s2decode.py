"""Decode Source 2 .vtex_c (to PNG) and .vsvg_c (to SVG) from a zip of raw files."""
import io, json, struct, sys, zipfile, os
import lz4.block
import texture2ddecoder as t2d
from PIL import Image

FMT = {1: "DXT1", 2: "DXT5", 3: "I8", 4: "RGBA8888", 15: "JPEG", 16: "PNG", 17: "JPEG", 18: "PNG",
       20: "BC7", 21: "ATI2N", 22: "IA88", 27: "ATI1N", 28: "BGRA8888"}


def blocks(b):
    size, hver, ver, boff, bcount = struct.unpack_from("<IHHII", b, 0)
    pos = 8 + boff
    out = {}
    for i in range(bcount):
        t = b[pos:pos + 4].decode("ascii", "replace")
        off, sz = struct.unpack_from("<II", b, pos + 4)
        out[t] = (pos + 4 + off, sz)
        pos += 12
    return out


def mip_bytes(fmt, w, h):
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
    if fmt in (1, 27):
        return bw * bh * 8
    if fmt in (2, 20, 21):
        return bw * bh * 16
    if fmt == 3:
        return w * h
    if fmt == 22:
        return w * h * 2
    return w * h * 4


def decode_vtex(b):
    bl = blocks(b)
    doff, dsz = bl["DATA"]
    (ver, flags) = struct.unpack_from("<HH", b, doff)
    w, h, depth, fmt, mips = struct.unpack_from("<HHHBB", b, doff + 20)
    p = doff + 28 + 4  # after picmip0res
    ex_off_pos = p
    ex_off, ex_cnt = struct.unpack_from("<II", b, p)
    comp_sizes = None
    real = None
    ep = ex_off_pos + ex_off
    for i in range(ex_cnt):
        typ, o, s = struct.unpack_from("<III", b, ep)
        at = ep + 4 + o
        if typ == 4:
            u1, u2, n = struct.unpack_from("<III", b, at)
            comp_sizes = list(struct.unpack_from("<%di" % n, b, at + 12))
        if typ == 3:
            real = struct.unpack_from("<HH", b, at)  # fill-to-pow2: real width/height (best guess)
        ep += 12
    data_start = doff + dsz
    if fmt in (15, 16, 17, 18):
        img = Image.open(io.BytesIO(b[data_start:]))
        return img.convert("RGBA"), FMT.get(fmt)
    # mips stored smallest first; the largest is last
    pos = data_start
    for m in range(mips - 1, -1, -1):
        mw, mh = max(1, w >> m), max(1, h >> m)
        raw_len = mip_bytes(fmt, mw, mh) * max(1, depth)
        clen = comp_sizes[m] if comp_sizes else raw_len
        chunk = b[pos:pos + clen]
        pos += clen
        if m != 0:
            continue
        if comp_sizes and clen < raw_len:
            chunk = lz4.block.decompress(chunk, uncompressed_size=raw_len)
        if fmt == 1:
            px = t2d.decode_bc1(chunk, w, h)
        elif fmt == 2:
            px = t2d.decode_bc3(chunk, w, h)
        elif fmt == 20:
            px = t2d.decode_bc7(chunk, w, h)
        elif fmt == 27:
            px = t2d.decode_bc4(chunk, w, h)
        elif fmt == 21:
            px = t2d.decode_bc5(chunk, w, h)
        elif fmt in (4,):
            return Image.frombytes("RGBA", (w, h), bytes(chunk)), "RGBA8888"
        elif fmt == 28:
            img = Image.frombytes("RGBA", (w, h), bytes(chunk))
            r, g, bb, a = img.split()
            return Image.merge("RGBA", (bb, g, r, a)), "BGRA8888"
        else:
            raise ValueError("format %s not handled" % fmt)
        img = Image.frombytes("RGBA", (w, h), px, "raw", "BGRA")
        if fmt == 2 and b"YCoCg" in b[:doff]:
            img = ycocg(img)
        if real and 0 < real[0] <= w and 0 < real[1] <= h:
            img = img.crop((0, 0, real[0], real[1]))
        return img, FMT.get(fmt, str(fmt))
    raise ValueError("no mip 0")


def ycocg(img):
    import numpy as np
    a = np.asarray(img).astype(np.float32)
    r, g, bl, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    sc = np.floor(bl / 8.0) + 1.0
    co = (r - 128.0) / sc
    cg = (g - 128.0) / sc
    y = al
    out = np.stack([y + co - cg, y + cg, y - co - cg, np.full_like(y, 255)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def decode_vsvg(b):
    bl = blocks(b)
    doff, dsz = bl["DATA"]
    data = b[doff:doff + dsz]
    i = data.find(b"<")
    return data[i:] if i >= 0 else data


def main(zip_path, out_dir):
    z = zipfile.ZipFile(zip_path)
    log = []
    for n in z.namelist():
        b = z.read(n)
        try:
            if n.endswith(".vtex_c"):
                img, f = decode_vtex(b)
                dst = os.path.join(out_dir, n[:-len(".vtex_c")] + ".png")
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                img.save(dst)
                log.append([n, f, img.size])
            elif n.endswith(".vsvg_c"):
                dst = os.path.join(out_dir, n[:-len(".vsvg_c")] + ".svg")
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                open(dst, "wb").write(decode_vsvg(b))
                log.append([n, "svg"])
            else:
                dst = os.path.join(out_dir, n)
                os.makedirs(os.path.dirname(dst) or out_dir, exist_ok=True)
                open(dst, "wb").write(b)
        except Exception as e:
            log.append([n, "ERROR", repr(e)])
    for l in log:
        print(l)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
