"""Minimal KV3 v5 binary reader for .vdata_c files.
A port of the parts of ValveResourceFormat BinaryKV3.cs (MIT) that Deadlock's current files use.
https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/ValveResourceFormat/Resource/ResourceTypes/BinaryKV3.cs
Needs: pip install lz4 zstandard
"""
import struct, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from s2decode import blocks
import lz4.block, zstandard

# Node type ids. The 8 and 16 bit ids are from memory; every file we read is fully consumed, which read() checks.
T = dict(NULL=1, BOOLEAN=2, INT64=3, UINT64=4, DOUBLE=5, STRING=6, BLOB=7, ARRAY=8, OBJECT=9, ARRAY_TYPED=10,
         INT32=11, UINT32=12, TRUE=13, FALSE=14, I64_0=15, I64_1=16, D0=17, D1=18, FLOAT=19,
         INT16=20, UINT16=21, UINT8=22, INT8=23, ARR_BYTELEN=24, ARR_AUX=25)
R = {v: k for k, v in T.items()}

class Lane:
    def __init__(s, b1=b'', b2=b'', b4=b'', b8=b''):
        s.b = {1: b1, 2: b2, 4: b4, 8: b8}; s.p = {1: 0, 2: 0, 4: 0, 8: 0}
    def rd(s, n, fmt):
        v = struct.unpack_from(fmt, s.b[n], s.p[n])[0]; s.p[n] += n; return v
    def left(s): return {k: len(s.b[k]) - s.p[k] for k in s.b}

def align(o, a): return (o + a - 1) // a * a

def decomp(method, data, usize):
    if method == 0: return data
    if method == 1: return lz4.block.decompress(data, uncompressed_size=usize)
    return zstandard.ZstdDecompressor().decompress(data, max_output_size=usize)

def read(path):
    b = open(path, 'rb').read()
    o, sz = blocks(b)['DATA']
    d = b[o:o + sz]
    magic = d[:4]; assert magic[0] == 5, magic
    p = 20
    (method, dictid, frame, c1, c4, c8, ctypes, nobj, narr, utot, ctot, nblk, blobsz, c2, bcs,
     u1, cs1, u2, cs2, c1b, c2b, c4b, c8b, nnodes, nobj2, narr2, nel) = struct.unpack_from('<IHHiiiiHHiiiiiiiiiiiiiiiiii', d, p)
    p += struct.calcsize('<IHHiiiiHHiiiiiiiiiiiiiiiiii')
    assert nblk == 0, nblk
    buf1 = decomp(method, d[p:p + cs1], u1); p += cs1
    buf2 = decomp(method, d[p:p + cs2], u2); p += cs2
    # buffer 1
    off = 0
    l1 = {}
    def cut(buf, off, n, a):
        if n <= 0: return b'', off
        off = align(off, a); return buf[off:off + n * a], off + n * a
    B1 = buf1[0:c1]; off = c1
    B2, off = cut(buf1, off, c2, 2)
    B4, off = cut(buf1, off, c4, 4)
    B8, off = cut(buf1, off, c8, 8)
    nstr = struct.unpack_from('<i', B4, 0)[0]; B4 = B4[4:]
    strs = []; q = 0
    for i in range(nstr):
        e = B1.index(b'\0', q); strs.append(B1[q:e].decode('utf-8', 'replace')); q = e + 1
    aux = Lane(B1[q:], B2, B4, B8)
    # buffer 2
    off = nobj2 * 4
    objlens = list(struct.unpack_from('<%di' % nobj2, buf2, 0))
    C1 = buf2[off:off + c1b]; off += c1b
    C2, off = cut(buf2, off, c2b, 2)
    C4, off = cut(buf2, off, c4b, 4)
    C8, off = cut(buf2, off, c8b, 8)
    types = buf2[off:off + ctypes]; off += ctypes
    main = Lane(C1, C2, C4, C8)
    st = {'t': 0, 'o': 0}
    def rtype():
        x = types[st['t']]; st['t'] += 1
        if x & 0x80: st['t'] += 1
        if x & 0x40: st['t'] += 1
        return x & 0x3F
    def gs(i): return strs[i] if 0 <= i < len(strs) else ''
    def val(t, lane):
        n = R.get(t)
        if n == 'NULL': return None
        if n == 'TRUE': return True
        if n == 'FALSE': return False
        if n in ('I64_0', 'D0'): return 0
        if n in ('I64_1', 'D1'): return 1
        if n == 'BOOLEAN': return lane.rd(1, '<B') != 0
        if n == 'INT8': return lane.rd(1, '<b')
        if n == 'UINT8': return lane.rd(1, '<B')
        if n == 'INT16': return lane.rd(2, '<h')
        if n == 'UINT16': return lane.rd(2, '<H')
        if n == 'INT32': return lane.rd(4, '<i')
        if n == 'UINT32': return lane.rd(4, '<I')
        if n == 'FLOAT': return lane.rd(4, '<f')
        if n == 'INT64': return lane.rd(8, '<q')
        if n == 'UINT64': return lane.rd(8, '<Q')
        if n == 'DOUBLE': return lane.rd(8, '<d')
        if n == 'STRING': return gs(main.rd(4, '<i'))
        if n == 'ARRAY':
            ln = main.rd(4, '<i'); return [val(rtype(), main) for _ in range(ln)]
        if n in ('ARRAY_TYPED', 'ARR_BYTELEN', 'ARR_AUX'):
            ln = main.rd(4, '<i') if n == 'ARRAY_TYPED' else main.rd(1, '<B')
            sub = rtype()
            el = aux if n == 'ARR_AUX' else main
            return [val(sub, el) for _ in range(ln)]
        if n == 'OBJECT':
            ln = objlens[st['o']]; st['o'] += 1
            obj = {}
            for _ in range(ln):
                tt = rtype(); k = gs(main.rd(4, '<i')); obj[k] = val(tt, main)
            return obj
        raise ValueError('type %r' % t)
    root = val(rtype(), main)
    return root, {'types_left': ctypes - st['t'], 'main': main.left(), 'aux': aux.left(), 'objs_left': nobj2 - st['o']}

if __name__ == '__main__':
    import json
    r, chk = read(sys.argv[1]); print(chk, file=sys.stderr)
    json.dump(r, open(sys.argv[2], 'w'), indent=1, default=str)
