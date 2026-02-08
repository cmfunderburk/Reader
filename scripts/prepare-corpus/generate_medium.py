#!/usr/bin/env python3
"""
Generate corpus-medium.jsonl by filtering the bottom 20% of Hard articles
by a weighted composite of Dale-Chall (0.50), FK Grade (0.25), and
%Polysyllabic (0.25), z-normalized against the Hard corpus.

Usage:
    uv run generate_medium.py
"""

import json
import re
import statistics
import sys
from pathlib import Path

from wordfreq import zipf_frequency

# ---------------------------------------------------------------------------
# Composite weights and cutoff
# ---------------------------------------------------------------------------
W_DC = 0.50
W_FK = 0.25
W_POLY = 0.25
PERCENTILE_CUTOFF = 20  # bottom 20% of Hard

# ---------------------------------------------------------------------------
_VOWELS = set("aeiouyAEIOUY")
_WORD_RE = re.compile(r"[a-zA-Z']+")


def count_syllables(word: str) -> int:
    word = word.strip(".,;:!?\"'()[]")
    if not word:
        return 1
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in _VOWELS
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def score_article(text: str) -> dict | None:
    raw_words = text.split()
    n_words = len(raw_words)
    if n_words == 0:
        return None

    n_sents = max(1, len(re.findall(r"[.!?]+", text)))
    alpha_words = _WORD_RE.findall(text.lower())
    n_alpha = len(alpha_words)
    if n_alpha == 0:
        return None

    # FK Grade
    n_syllables = sum(count_syllables(w) for w in raw_words)
    fk = 0.39 * (n_words / n_sents) + 11.8 * (n_syllables / n_words) - 15.59

    # Dale-Chall (Zipf-based familiar threshold)
    zipf_scores = [zipf_frequency(w, "en") for w in alpha_words]
    n_unfamiliar = sum(1 for z in zipf_scores if z < 4.0)
    pct_unfamiliar = (n_unfamiliar / n_alpha) * 100
    dc = 0.1579 * pct_unfamiliar + 0.0496 * (n_words / n_sents)
    if pct_unfamiliar > 5:
        dc += 3.6365

    # % Polysyllabic
    n_poly = sum(1 for w in alpha_words if count_syllables(w) >= 3)
    pct_poly = n_poly / n_alpha

    return {"fk": fk, "dc": dc, "pct_poly": pct_poly}


def main():
    script_dir = Path(__file__).parent
    hard_path = script_dir / "corpus-hard.jsonl"
    out_path = script_dir / "corpus-medium.jsonl"

    print("Loading Hard corpus...")
    hard_articles = []
    with open(hard_path) as f:
        for line in f:
            line = line.strip()
            if line:
                hard_articles.append(json.loads(line))
    print(f"  {len(hard_articles):,} articles")

    print(f"\nScoring all articles...")
    scored = []  # (index, scores)
    for i, art in enumerate(hard_articles):
        if (i + 1) % 5000 == 0:
            print(f"  {i + 1:,} / {len(hard_articles):,}")
        s = score_article(art["text"])
        if s:
            scored.append((i, s))
    print(f"  Scored: {len(scored):,}")

    # Z-normalize against Hard corpus
    fk_vals = [s["fk"] for _, s in scored]
    dc_vals = [s["dc"] for _, s in scored]
    poly_vals = [s["pct_poly"] for _, s in scored]

    fk_mean, fk_std = statistics.mean(fk_vals), statistics.stdev(fk_vals)
    dc_mean, dc_std = statistics.mean(dc_vals), statistics.stdev(dc_vals)
    poly_mean, poly_std = statistics.mean(poly_vals), statistics.stdev(poly_vals)

    def composite(s: dict) -> float:
        z_fk = (s["fk"] - fk_mean) / fk_std
        z_dc = (s["dc"] - dc_mean) / dc_std
        z_poly = (s["pct_poly"] - poly_mean) / poly_std
        return W_DC * z_dc + W_FK * z_fk + W_POLY * z_poly

    ranked = [(i, composite(s)) for i, s in scored]
    ranked.sort(key=lambda x: x[1])

    n_medium = int(len(ranked) * PERCENTILE_CUTOFF / 100)
    selected_indices = set(i for i, _ in ranked[:n_medium])

    print(f"\n  Cutoff: bottom {PERCENTILE_CUTOFF}% → {n_medium:,} articles")

    # Write output
    written = 0
    with open(out_path, "w") as f:
        for i, art in enumerate(hard_articles):
            if i in selected_indices:
                f.write(json.dumps(art, ensure_ascii=False) + "\n")
                written += 1

    print(f"  Wrote {written:,} articles to {out_path.name}")

    # Quick profile
    medium_fk = [scored_s["fk"] for idx, scored_s in scored if idx in selected_indices]
    medium_dc = [scored_s["dc"] for idx, scored_s in scored if idx in selected_indices]
    medium_poly = [scored_s["pct_poly"] for idx, scored_s in scored if idx in selected_indices]

    print(f"\n  Medium tier profile:")
    print(f"    FK Grade:    mean={statistics.mean(medium_fk):.2f}  median={statistics.median(medium_fk):.2f}")
    print(f"    Dale-Chall:  mean={statistics.mean(medium_dc):.2f}  median={statistics.median(medium_dc):.2f}")
    print(f"    %Polysyllab: mean={statistics.mean(medium_poly):.1%}  median={statistics.median(medium_poly):.1%}")


if __name__ == "__main__":
    main()
