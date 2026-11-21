"""Score results.jsonl: auto-check field JSON and summarise speed and cost per model.

Usage: python score.py <results.jsonl>
"""
import json
import math
import re
import statistics
import sys
from collections import defaultdict

from run_eval import POSITIONS

OFF = {"first slip", "second slip", "third slip", "fourth slip", "gully", "silly point", "silly mid-off",
       "point", "backward point", "cover point", "cover", "extra cover", "third man", "short third man",
       "deep third man", "deep point", "deep backward point", "deep cover", "deep extra cover", "short cover"}
LEG = {"leg slip", "short leg", "silly mid-on", "mid-wicket", "square leg", "backward square leg",
       "short fine leg", "fine leg", "deep fine leg", "deep mid-wicket", "deep square leg",
       "deep backward square leg", "short mid-wicket"}


def extract_json(text: str):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def check_field(text: str, hand: str) -> dict:
    out = {"valid_json": False, "eleven": False, "roles_ok": False, "names_ok": False,
           "coords_ok": False, "powerplay_ok": False, "side_errors": None, "pass": False}
    data = extract_json(text)
    if not isinstance(data, dict) or not isinstance(data.get("fielders"), list):
        return out
    out["valid_json"] = True
    f = data["fielders"]
    names = [str(x.get("position", "")).strip().lower() for x in f if isinstance(x, dict)]
    out["eleven"] = len(f) == 11
    out["roles_ok"] = names.count("bowler") == 1 and names.count("wicketkeeper") == 1
    out["names_ok"] = all(n in POSITIONS for n in names)
    try:
        pts = [(str(x["position"]).lower(), float(x["x"]), float(x["y"])) for x in f]
    except (KeyError, TypeError, ValueError):
        return out
    out["coords_ok"] = all(-1 <= x <= 1 and -1 <= y <= 1 for _, x, y in pts)
    outside = [n for n, x, y in pts if n not in ("bowler", "wicketkeeper") and math.hypot(x, y) > 0.43]
    out["powerplay_ok"] = len(outside) <= 2
    off_sign = -1 if hand == "right" else 1
    errors = 0
    for n, x, _ in pts:
        if abs(x) < 0.05:
            continue
        if n in OFF and math.copysign(1, x) != off_sign:
            errors += 1
        if n in LEG and math.copysign(1, x) == off_sign:
            errors += 1
    out["side_errors"] = errors
    out["pass"] = all(out[k] for k in ("valid_json", "eleven", "roles_ok", "names_ok", "coords_ok", "powerplay_ok")) and errors == 0
    return out


def main():
    rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
    by_model = defaultdict(list)
    for r in rows:
        by_model[r["model"]].append(r)
    print(f"{'model':48} {'errs':>4} {'ttft':>6} {'total':>6} {'$/100 chats':>11}  json_right  json_left")
    for model, rs in by_model.items():
        ok = [r for r in rs if not r["error"]]
        ttft = statistics.median([r["ttft"] for r in ok if r["ttft"] is not None] or [float("nan")])
        total = statistics.median([r["total"] for r in ok if r["total"] is not None] or [float("nan")])
        chat_costs = [r["cost"] for r in ok if r["cost"] is not None and not r["item"].startswith("j")]
        per100 = statistics.mean(chat_costs) * 100 if chat_costs else float("nan")
        js = {}
        for r in rs:
            if r["item"].startswith("j"):
                js[r["item"]] = check_field(r["text"], "right" if "right" in r["item"] else "left")
        jr, jl = js.get("j1_field_right", {}), js.get("j2_field_left", {})
        def fmt(c):
            if not c:
                return "missing"
            flags = "".join("Y" if c[k] else "n" for k in ("valid_json", "eleven", "roles_ok", "names_ok", "coords_ok", "powerplay_ok"))
            return f"{'PASS' if c['pass'] else 'fail'} {flags} side_err={c['side_errors']}"
        print(f"{model:48} {len(rs)-len(ok):>4} {ttft:>6} {total:>6} {per100:>11.4f}  {fmt(jr)}  |  {fmt(jl)}")


if __name__ == "__main__":
    main()
