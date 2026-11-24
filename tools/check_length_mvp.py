"""Run the archived and held-out matches through the site's JavaScript scorer."""
import argparse
import json
import subprocess
import zipfile
from pathlib import Path

from length_data import ROOT, matches, split


def score_input(p):
    return dict(player_slot=p["player_slot"], team=p["team"], hero_id=p["hero_id"], mvp_rank=p["mvp_rank"],
                kills=p["kills"], deaths=p["deaths"], assists=p["assists"], net_worth=p["net_worth"],
                stats=[{k: p[k] for k in ("player_damage", "boss_damage", "teammate_healing")}],
                accolades=[dict(accolade_id=a, accolade_stat_value=v, accolade_threshold_achieved=t)
                           for a, v, t in zip(p["accolade_id"] or [], p["accolade_stat_value"] or [],
                                             p["accolade_threshold_achieved"] or [])])


def check(data):
    train, ranked, fixed, held = split(data)
    assert not train & (ranked | fixed | held)
    with subprocess.Popen(["node", "tools/check_length_mvp.js"], cwd=ROOT, stdin=subprocess.PIPE) as node:
        def emit(labels, mi):
            row = json.dumps([labels, mi], separators=(",", ":")).encode()
            node.stdin.write(row + b"\n")

        with zipfile.ZipFile(data / "mvp_matches.zip") as archive:
            for name in sorted(archive.namelist()):
                if name.endswith(".json"):
                    mid = int(Path(name).stem)
                    match = json.loads(archive.read(name))
                    emit(["A", "B"] if mid in fixed else ["A"], match.get("match_info", match))
        for mid, players in matches(data):
            if mid in held:
                p = players[0]
                emit(["C Combined", "C " + p["match_mode"]], dict(match_id=mid, duration_s=p["duration_s"],
                     winning_team=p["winning_team"], players=[score_input(row) for row in players]))
        node.stdin.close()
        if node.wait():
            raise SystemExit(node.returncode)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    check(parser.parse_args().data)

