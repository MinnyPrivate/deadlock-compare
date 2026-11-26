"""Verify Summary place card vs MVP Valve tab place agreement across all 500 Set A matches (old vs new code)."""
import argparse
import json
import subprocess
import zipfile
from pathlib import Path

from length_data import ROOT


def main(data_dir):
    with subprocess.Popen(["node", "tools/check_place_agreement.js"], cwd=ROOT, stdin=subprocess.PIPE) as node:
        with zipfile.ZipFile(data_dir / "mvp_matches.zip") as archive:
            for name in sorted(archive.namelist()):
                if not name.endswith(".json"):
                    continue
                match = json.loads(archive.read(name))
                mi = match.get("match_info", match)
                slim = {
                    "match_id": mi["match_id"],
                    "duration_s": mi["duration_s"],
                    "winning_team": mi["winning_team"],
                    "game_mode": mi.get("game_mode", 1),
                    "start_time": mi.get("start_time", 0),
                    "players": [
                        {
                            "account_id": p.get("account_id", 0),
                            "player_slot": p["player_slot"],
                            "team": p["team"],
                            "hero_id": p["hero_id"],
                            "assigned_lane": p.get("assigned_lane", 0),
                            "abandon_match_time_s": p.get("abandon_match_time_s", 0),
                            "mvp_rank": p.get("mvp_rank", 0),
                            "kills": p.get("kills", 0),
                            "deaths": p.get("deaths", 0),
                            "assists": p.get("assists", 0),
                            "net_worth": p.get("net_worth", 0),
                            "last_hits": p.get("last_hits", 0),
                            "denies": p.get("denies", 0),
                            "accolades": p.get("accolades", []),
                            "death_details": [],
                            "items": [],
                            "stats": [p["stats"][-1]] if p.get("stats") else [{}],
                        }
                        for p in mi["players"]
                    ],
                }
                node.stdin.write(json.dumps(slim, separators=(",", ":")).encode() + b"\n")
        node.stdin.close()
        if node.wait():
            raise SystemExit(node.returncode)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    main(parser.parse_args().data)
