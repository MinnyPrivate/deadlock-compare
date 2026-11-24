"""Read the frozen MVP archives and reconstruct the original pipeline holdout using Python stdlib."""
import collections
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tools/data/mvp_check_100.txt"


def _pcg64_seed0_random(n):
    """Exact pure-Python equivalent of numpy.random.default_rng(0).random(n) (SeedSequence(0) + PCG64)."""
    init_a, mult_a = 0x43B0D7E5, 0x931E8875
    init_b, mult_b = 0x8B51F9DD, 0x58F38DED
    mix_l, mix_r = 0xCA01F9DD, 0x4973F715
    m32, m64, m128 = 0xFFFFFFFF, (1 << 64) - 1, (1 << 128) - 1

    hc = init_a

    def hashmix(val):
        nonlocal hc
        val = (val ^ hc) & m32
        hc = (hc * mult_a) & m32
        val = (val * hc) & m32
        return (val ^ (val >> 16)) & m32

    def mix(x, y):
        res = (mix_l * x - mix_r * y) & m32
        return (res ^ (res >> 16)) & m32

    pool = [hashmix(0) for _ in range(4)]
    for src in range(4):
        for dst in range(4):
            if src != dst:
                pool[dst] = mix(pool[dst], hashmix(pool[src]))

    hc = init_b
    words = []
    for i in range(8):
        v = (pool[i % 4] ^ hc) & m32
        hc = (hc * mult_b) & m32
        v = (v * hc) & m32
        words.append((v ^ (v >> 16)) & m32)
    u64 = [words[2 * i] | (words[2 * i + 1] << 32) for i in range(4)]
    initstate = (u64[0] << 64) | u64[1]
    initseq = (u64[2] << 64) | u64[3]

    mult128 = (2549297995355413924 << 64) | 4865540595714422341
    inc = ((initseq << 1) | 1) & m128
    state = (inc + initstate) & m128
    state = (state * mult128 + inc) & m128

    scale = 1.0 / (1 << 53)
    out = []
    for _ in range(n):
        state = (state * mult128 + inc) & m128
        x = ((state >> 64) ^ state) & m64
        rot = state >> 122
        r = ((x >> rot) | (x << ((-rot) & 63))) & m64
        out.append((r >> 11) * scale)
    return out


def matches(data):
    """Yield (match_id, players) for every valid 12-player match in mvp_rows.zip, sorted by match_id."""
    by_id = collections.defaultdict(list)
    with zipfile.ZipFile(data / "mvp_rows.zip") as archive:
        for name in sorted(archive.namelist()):
            with archive.open(name) as src:
                for line in src:
                    row = json.loads(line)
                    by_id[row["match_id"]].append(row)
    for mid in sorted(by_id):
        players = by_id[mid]
        # Exact loadbig.py filters, before the 25% test split in big.py.
        awards = sorted(p["mvp_rank"] for p in players if p["mvp_rank"])
        if len(players) == 12 and awards == [1, 2, 3] and sum(p["won"] for p in players) == 6:
            yield mid, players


def split(data):
    ids = [mid for mid, _ in matches(data)]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate match groups in the archive")
    held = {mid for mid, draw in zip(ids, _pcg64_seed0_random(len(ids))) if draw < 0.25}
    with zipfile.ZipFile(data / "mvp_matches.zip") as archive:
        ranked = {int(Path(n).stem) for n in archive.namelist() if n.endswith(".json")}
    check = set(map(int, CHECK.read_text(encoding="utf8").split()))
    if len(ranked) != 500 or len(check) != 100 or not check <= ranked:
        raise ValueError("Invalid evaluation sets")
    return set(ids) - held - ranked, ranked, check, held
