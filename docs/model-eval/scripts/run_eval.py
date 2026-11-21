"""Model test for Sports Insight Bot.

Usage: python run_eval.py <env_file> <images_dir> <out_jsonl>
Runs every test item against every model over OpenRouter (streaming) and
writes one JSON line per (model, item) with text, timing, tokens and cost.
"""
import base64
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import dotenv_values
from openai import OpenAI

ENV = IMAGES = OUT = None  # set in main()

# Per-model request extras (reasoning models need thinking limited or off).
EXTRA = {
    "qwen/qwen3.5-9b": {"max_tokens": 1500, "body": {"reasoning": {"enabled": False}}},
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {"max_tokens": 6000, "body": {"reasoning": {"effort": "low"}}},
}

MODELS = [
    "google/gemma-4-26b-a4b-it",
    "mistralai/mistral-small-3.2-24b-instruct",
    "qwen/qwen3.5-9b",
    "qwen/qwen3-vl-8b-instruct",
    "meta-llama/llama-4-scout",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
]

SYSTEM = (
    "You are the Analyst in Sports Insight Bot, a cricket-first sports analyst. "
    "Give accurate, specific tactical analysis. Keep answers under 200 words unless asked for data. "
    "If you are not sure about something in an image, say so instead of guessing."
)

TEXT_ITEMS = {
    "c1_powerplay": "Explain the T20 powerplay fielding restrictions and how a captain should use them against an aggressive opener.",
    "c2_offspin_lefty": "Set a field for a right-arm off-spinner bowling to a left-handed batter in the middle overs of an ODI. Name every fielding position and explain the plan.",
    "c3_reverse_swing": "What is reverse swing, when does it happen, and which bowlers were famous for it?",
    "c4_test_vs_t20": "Compare Test and T20 batting strategy in 5 bullet points.",
    "c5_dls": "Explain the Duckworth-Lewis-Stern method in simple words.",
    "c6_nightwatch": "What is a nightwatchman in Test cricket and why do teams use one?",
    "c7_left_arm_swing": "My team has a left-arm swing bowler and the batter is right-handed. Why is this angle dangerous early in an innings? Suggest a plan for the first 3 overs.",
    "o1_football_press": "In football, how does a high press differ from a mid-block? When would a coach choose each?",
    "o2_basketball_pnr": "What is the pick and roll in basketball, and what are two common ways to defend it?",
    "o3_tennis_clay": "Why do tennis players serve and volley less on clay courts than on grass?",
}

IMAGE_ITEMS = {
    "i1_batting_shot": ("batting_shot.jpg", "This image is a sequence of frames. Describe what the batter does frame by frame, name the likely shot, and point out anything unusual about the setting or equipment."),
    "i2_slip_cordon": ("slip_cordon.jpg", "How many close catchers (including the wicketkeeper) can you see behind the batter? What does this field and the ball colour tell you about the bowler and the type of match?"),
    "i3_fielding_diagram": ("fielding_diagram.jpg", "Using this diagram, list five deep fielding positions on the off side, and explain where gully is compared with the slips."),
    "i4_scoreboard": ("scoreboard.jpg", "Read this scoreboard. What ground name, team names and numbers are shown? Only report what is actually visible."),
    "i5_bowler_to_batter": ("bowler_to_batter.jpg", "Describe this moment: who is where, what the bowler has just done, and what the batter is about to do. What format does this look like?"),
}

POSITIONS = [
    "wicketkeeper", "bowler", "first slip", "second slip", "third slip", "fourth slip", "gully", "leg slip",
    "short leg", "silly point", "silly mid-off", "silly mid-on", "point", "backward point", "cover point",
    "cover", "extra cover", "mid-off", "mid-on", "mid-wicket", "square leg", "backward square leg",
    "short fine leg", "fine leg", "deep fine leg", "third man", "short third man", "deep third man",
    "deep point", "deep backward point", "deep cover", "deep extra cover", "long off", "long on",
    "deep mid-wicket", "deep square leg", "deep backward square leg", "short cover", "short mid-wicket",
]

SCHEMA_TEXT = """Return ONLY a JSON object, no other text, with this shape:
{
  "format": "T20",
  "phase": "powerplay",
  "bowler_type": "<string>",
  "batter_hand": "right" or "left",
  "fielders": [
    {"position": "<one name from the allowed list>", "x": <number -1..1>, "y": <number -1..1>}
  ]
}
Rules for the fielders array:
- Exactly 11 entries, including "bowler" and "wicketkeeper".
- Coordinates: the Ground is a circle of radius 1 centred at (0,0). The striker stands at (0, 0.1) facing down the pitch towards the bowler at (0, -0.15). The wicketkeeper is behind the striker (y > 0.1).
- x < 0 is the left side of the picture, x > 0 the right side. For a RIGHT-handed batter the off side is x < 0; for a LEFT-handed batter the off side is x > 0.
- The 30-yard circle is radius 0.43. Respect the T20 powerplay limit: at most 2 fielders (not counting bowler and wicketkeeper) outside the circle.
Allowed position names: """ + ", ".join(POSITIONS)

JSON_ITEMS = {
    "j1_field_right": "Set a T20 powerplay field for a right-arm fast bowler bowling outswing to a RIGHT-handed opening batter.\n\n" + SCHEMA_TEXT,
    "j2_field_left": "Set a T20 powerplay field for a right-arm fast bowler bowling outswing to a LEFT-handed opening batter.\n\n" + SCHEMA_TEXT,
}


def image_url(name: str) -> str:
    path = IMAGES / name
    raw = path.read_bytes()
    mime = "image/png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def build_items():
    items = []
    for k, q in TEXT_ITEMS.items():
        items.append((k, [{"role": "user", "content": q}]))
    for k, (img, q) in IMAGE_ITEMS.items():
        items.append((k, [{"role": "user", "content": [
            {"type": "text", "text": q},
            {"type": "image_url", "image_url": {"url": image_url(img)}},
        ]}]))
    for k, q in JSON_ITEMS.items():
        items.append((k, [{"role": "user", "content": q}]))
    return items


lock = threading.Lock()


def run_one(client: OpenAI, model: str, item_id: str, messages: list) -> dict:
    rec = {"model": model, "item": item_id, "text": "", "ttft": None, "total": None,
           "prompt_tokens": None, "completion_tokens": None, "cost": None, "error": None}
    extra = EXTRA.get(model, {})
    for attempt in range(4):
        start = time.perf_counter()
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": SYSTEM}, *messages],
                max_tokens=extra.get("max_tokens", 1500), temperature=0.3, stream=True,
                extra_body={"usage": {"include": True}, **extra.get("body", {})},
            )
            parts = []
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    if rec["ttft"] is None:
                        rec["ttft"] = round(time.perf_counter() - start, 2)
                    parts.append(chunk.choices[0].delta.content)
                usage = getattr(chunk, "usage", None)
                if usage:
                    rec["prompt_tokens"] = usage.prompt_tokens
                    rec["completion_tokens"] = usage.completion_tokens
                    rec["cost"] = getattr(usage, "cost", None) or (usage.model_extra or {}).get("cost")
            rec["total"] = round(time.perf_counter() - start, 2)
            rec["text"] = "".join(parts)
            rec["error"] = None
            break
        except Exception as e:  # record and retry rate limits / transient errors
            rec["error"] = f"{type(e).__name__}: {str(e)[:200]}"
            time.sleep(8 * (attempt + 1))
    return rec


def run_model(model: str, items, client: OpenAI):
    for item_id, messages in items:
        rec = run_one(client, model, item_id, messages)
        with lock:
            with OUT.open("a") as f:
                f.write(json.dumps(rec) + "\n")
            status = "ERR" if rec["error"] else "ok"
            print(f"{status:3} {model[:40]:40} {item_id:20} ttft={rec['ttft']} total={rec['total']}", flush=True)


def main():
    global ENV, IMAGES, OUT
    ENV, IMAGES, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    models = sys.argv[4].split(",") if len(sys.argv) > 4 else MODELS
    key = dotenv_values(ENV).get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY missing in env file")
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key, timeout=180)
    items = build_items()
    OUT.write_text("")
    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        for m in models:
            pool.submit(run_model, m, items, client)


if __name__ == "__main__":
    main()
