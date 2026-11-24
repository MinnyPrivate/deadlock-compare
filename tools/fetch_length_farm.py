"""Rebuild the two missing Impact farming columns from the public, keyless SQL API."""
import argparse
import csv
import gzip
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime
from pathlib import Path

from length_data import ROOT, matches, split

SQL = """SELECT DISTINCT ON (match_id,player_slot) match_id AS m, player_slot AS s,
"stats.gold_lane_creep"[-1]+"stats.gold_lane_creep_orbs"[-1] AS l,
"stats.gold_neutral_creep"[-1]+"stats.gold_neutral_creep_orbs"[-1] AS j
FROM match_player WHERE match_id BETWEEN {lo} AND {hi}
AND game_mode='Normal' AND match_mode IN ('Ranked','Unranked')
AND start_time >= TIMESTAMPTZ '2026-11-13 12:00:00+00'
ORDER BY match_id DESC, player_slot, created_at DESC LIMIT 100000"""


def query(lo, hi):
    url = "https://api.deadlock-api.com/v1/sql?" + urllib.parse.urlencode({"query": SQL.format(lo=lo, hi=hi)})
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Postmortem-Length-Norms/1"})
            with urllib.request.urlopen(req, timeout=150) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429 and error.code < 500:
                raise
            retry = error.headers.get("Retry-After", "")
            seconds = int(retry) if retry.isdigit() else (
                parsedate_to_datetime(retry).timestamp() - time.time() if retry else 0)
            time.sleep(max(31 * (attempt + 1), seconds))
    raise RuntimeError("Public SQL did not return the requested page")


def fill_missing(data, train, result):
    for mid, players in matches(data):
        if mid not in train:
            continue
        missing = [p for p in players if (mid, p["player_slot"]) not in result
                   or None in result[mid, p["player_slot"]]]
        if not missing:
            continue
        req = urllib.request.Request(f"https://api.deadlock-api.com/v1/matches/{mid}/metadata",
                                     headers={"User-Agent": "Postmortem-Length-Norms/1"})
        while True:
            try:
                with urllib.request.urlopen(req, timeout=80) as response:
                    info = json.load(response)["match_info"]
                break
            except urllib.error.HTTPError as error:
                if error.code != 429:
                    raise
                delay = error.headers.get("Retry-After", "60")
                time.sleep(int(delay) if delay.isdigit() else max(1, parsedate_to_datetime(delay).timestamp() - time.time()))
        for p in missing:
            player = next(q for q in info["players"] if q["player_slot"] == p["player_slot"] and q["hero_id"] == p["hero_id"])
            if info["match_id"] != mid or info["duration_s"] != p["duration_s"]:
                raise ValueError("Full match differs from the archived row")
            f = player["stats"][-1]
            result[mid, p["player_slot"]] = (f.get("gold_lane_creep", 0) + f.get("gold_lane_creep_orbs", 0),
                                             f.get("gold_neutral_creep", 0) + f.get("gold_neutral_creep_orbs", 0))
        time.sleep(3.2)


def save(result):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["match_id", "slot", "trooper_souls", "neutral_souls"])
    writer.writerows((*key, *result[key]) for key in sorted(result))
    (ROOT / "tools/data/length_farm.csv.gz").write_bytes(gzip.compress(buf.getvalue().encode(), mtime=0))


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("data", type=Path)
    data = args.parse_args().data
    train, _, _, _ = split(data)
    lo, hi = min(train), max(train)
    result = {}
    while hi >= lo:
        page = query(lo, hi)
        if not page:
            break
        last = page[-1]["m"]
        for row in page:
            if row["m"] in train:
                result[row["m"], row["s"]] = (row["l"], row["j"])
        print("Read through", last, "with", len(result), "training player rows", flush=True)
        if len(page) < 100000:
            break
        if last >= hi:
            raise ValueError("SQL page did not advance")
        hi = last  # repeat the last match in case the page ended between two players
        time.sleep(31)
    if not result:
        raise ValueError("No training data returned")
    fill_missing(data, train, result)
    save(result)


if __name__ == "__main__":
    main()

