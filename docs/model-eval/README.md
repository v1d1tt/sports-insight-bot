# Model test (2026-11-21)

Goal: pick a small multimodal model on OpenRouter for the Analyst. The old model, `qwen/qwen-2.5-vl-7b-instruct`, has no providers left on OpenRouter.

## Test set

- **10 text questions:** 7 cricket (powerplay rules, field for an off-spinner to a left-hander, reverse swing, Test vs T20, DLS, nightwatchman, left-arm swing plan) and 3 other sports (football press, basketball pick and roll, tennis on clay).
- **5 images** from Wikimedia Commons (credits in `image-credits.json`): batting-shot sequence, slip cordon, fielding-positions diagram, scoreboard, bowler-to-batter frame.
- **2 field-placement tasks:** return a T20 powerplay field as JSON for a right-handed and a left-handed batter. A script checks: valid JSON, 11 fielders, one bowler and one wicketkeeper, allowed position names, coordinates in range, at most 2 fielders outside the circle, and off/leg side matches the batter hand.

Same system prompt for every model, temperature 0.3, streaming. Reasoning models: `qwen3.5-9b` ran with thinking off; Nemotron ran with low thinking effort and a 6,000-token budget (with 1,500 tokens both returned empty answers).

Answer quality was graded by hand from 1 to 5 against the real facts and what each image really shows. Cost is what OpenRouter charged.

## Results

| Model | Text (1-5) | Images (1-5) | Field JSON | Median first token | Median full answer | $ per 100 chats |
|---|---|---|---|---|---|---|
| **google/gemma-4-26b-a4b-it** | **4.1** | 3.4 | **2/2 pass, sensible fields** | **0.54 s** | 3.6 s | **$0.009** |
| mistralai/mistral-small-3.2-24b-instruct | 3.5 | 2.4 | 0/2 (powerplay limit broken) | 0.73 s | 4.0 s | $0.011 |
| meta-llama/llama-4-scout | 2.9 | 3.2 | 0/2 (off/leg side errors) | 0.82 s | 3.3 s | $0.016 |
| qwen/qwen3.5-9b (thinking off) | 2.5 | 2.8 | 0/2 (slips in front of the batter) | 0.54 s | 3.7 s | $0.014 |
| qwen/qwen3-vl-8b-instruct | 1.9 | 2.6 | 0/2 (off/leg side errors) | 0.68 s | 6.0 s | $0.036 |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 2.5 | **4.0** | 2/2 pass, but right-hander field has no one in front of the bat | 2.5 s (up to 14 s) | 6.2 s | free (rate-limited) |

## Notes

- **Gemma 4 26B-A4B:** right on the cricket rules that matter (powerplay, nightwatchman, left-arm angle). Errors: reverse swing direction stated backwards; invented a wicketkeeper in the bowler-to-batter frame.
- **Nemotron nano omni:** best at images (only model with no invented details on the bowler-to-batter frame) and the only one that takes audio. But it invented cricket rules ("only 2 slip fielders allowed in the powerplay", "Wasim Akram's doosra"), returned 1 empty answer after 6,000 thinking tokens, is slow, and exists only as a rate-limited free endpoint.
- **Qwen3-VL-8B:** most invented facts (for example "Shane Warne used reverse swing") and the highest cost.

## Decision

Recommended: **`google/gemma-4-26b-a4b-it`** (best text, only clean pass on field JSON, fastest, cheapest; a `:free` variant exists for development). Gemma takes no audio, so voice input uses the browser's speech-to-text. The Analyst prompt must tell it to say when it is unsure about image details.

Final choice (2026-11-21): **`google/gemma-4-26b-a4b-it`**, chosen by the project owner.

## Re-run

```bash
uv run --no-project --with openai,python-dotenv python scripts/run_eval.py <path/to/.env> <images_dir> results.jsonl
uv run --no-project --with openai,python-dotenv python scripts/score.py results.jsonl
```

Images are not stored in the repo; download them from the links in `image-credits.json` (the run script expects the file names listed there).
