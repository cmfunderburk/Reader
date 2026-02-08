#!/usr/bin/env python3
"""
Score all Hard-tier articles with a weighted composite of FK, Dale-Chall,
and %Polysyllabic to find a Medium-tier cutoff.

Weights: Dale-Chall 0.50, FK 0.25, %Poly 0.25
Scores are z-normalized against the Hard corpus before weighting.

Usage:
    uv run score_medium.py
"""

import json
import math
import re
import statistics
import sys
from pathlib import Path

from wordfreq import zipf_frequency

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


def load_corpus(path: Path) -> list[dict]:
    articles = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                articles.append(json.loads(line))
    return articles


def summarize(vals: list[float]) -> dict:
    s = sorted(vals)
    n = len(s)
    return {
        "mean": statistics.mean(s),
        "median": statistics.median(s),
        "stdev": statistics.stdev(s) if n > 1 else 0,
        "p10": s[int(n * 0.10)],
        "p25": s[int(n * 0.25)],
        "p75": s[int(n * 0.75)],
        "p90": s[int(n * 0.90)],
    }


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------
W_DC = 0.50
W_FK = 0.25
W_POLY = 0.25


def main():
    script_dir = Path(__file__).parent
    easy_path = script_dir / "corpus-easy.jsonl"
    hard_path = script_dir / "corpus-hard.jsonl"

    print("Loading corpora...")
    easy_articles = load_corpus(easy_path)
    hard_articles = load_corpus(hard_path)
    print(f"  Easy: {len(easy_articles):,}")
    print(f"  Hard: {len(hard_articles):,}")

    # Score all Easy articles
    print("\nScoring Easy articles...")
    easy_scores = []
    for art in easy_articles:
        s = score_article(art["text"])
        if s:
            easy_scores.append(s)
    print(f"  Scored: {len(easy_scores)}")

    # Score all Hard articles
    print(f"\nScoring all {len(hard_articles):,} Hard articles (this takes ~2 min)...")
    hard_scored = []  # (index, scores_dict)
    for i, art in enumerate(hard_articles):
        if (i + 1) % 5000 == 0:
            print(f"  {i + 1:,} / {len(hard_articles):,}")
        s = score_article(art["text"])
        if s:
            hard_scored.append((i, s))
    print(f"  Scored: {len(hard_scored):,}")

    # Compute z-normalization parameters from Hard corpus
    hard_fk = [s["fk"] for _, s in hard_scored]
    hard_dc = [s["dc"] for _, s in hard_scored]
    hard_poly = [s["pct_poly"] for _, s in hard_scored]

    fk_mean, fk_std = statistics.mean(hard_fk), statistics.stdev(hard_fk)
    dc_mean, dc_std = statistics.mean(hard_dc), statistics.stdev(hard_dc)
    poly_mean, poly_std = statistics.mean(hard_poly), statistics.stdev(hard_poly)

    print(f"\n  Hard corpus stats:")
    print(f"    FK:     mean={fk_mean:.2f}  std={fk_std:.2f}")
    print(f"    D-C:    mean={dc_mean:.2f}  std={dc_std:.2f}")
    print(f"    %Poly:  mean={poly_mean:.4f}  std={poly_std:.4f}")

    # Compute composite for Hard articles
    def composite(s: dict) -> float:
        z_fk = (s["fk"] - fk_mean) / fk_std
        z_dc = (s["dc"] - dc_mean) / dc_std
        z_poly = (s["pct_poly"] - poly_mean) / poly_std
        return W_DC * z_dc + W_FK * z_fk + W_POLY * z_poly

    hard_composites = [(i, composite(s), s) for i, s in hard_scored]
    hard_composites.sort(key=lambda x: x[1])

    comp_vals = [c for _, c, _ in hard_composites]

    # Also score Easy with the same normalization
    easy_composites = [composite(s) for s in easy_scores]

    print(f"\n  Composite score distribution:")
    print(f"    Easy:  mean={statistics.mean(easy_composites):.2f}  median={statistics.median(easy_composites):.2f}")
    print(f"    Hard:  mean={statistics.mean(comp_vals):.2f}  median={statistics.median(comp_vals):.2f}")

    # Show what different percentile cutoffs yield
    print(f"\n{'=' * 78}")
    print(f"  CANDIDATE MEDIUM-TIER CUTOFFS (lowest-composite slice of Hard corpus)")
    print(f"{'=' * 78}")
    print(f"\n  {'Cutoff':>8s} {'N articles':>11s} {'Comp ≤':>8s}"
          f" {'FK mean':>8s} {'D-C mean':>9s} {'%Poly':>8s}"
          f"  vs Easy FK  vs Easy D-C")
    print(f"  {'─' * 76}")

    easy_fk_mean = statistics.mean([s["fk"] for s in easy_scores])
    easy_dc_mean = statistics.mean([s["dc"] for s in easy_scores])
    easy_poly_mean = statistics.mean([s["pct_poly"] for s in easy_scores])

    # Reference: Easy
    print(f"  {'Easy':>8s} {len(easy_scores):>11,} {'':>8s}"
          f" {easy_fk_mean:>8.2f} {easy_dc_mean:>9.2f} {easy_poly_mean:>8.1%}")

    for pctile in [5, 10, 15, 20, 25, 30, 35, 40, 50]:
        n = int(len(hard_composites) * pctile / 100)
        if n == 0:
            continue
        subset = hard_composites[:n]
        max_comp = subset[-1][1]

        fk_vals = [s["fk"] for _, _, s in subset]
        dc_vals = [s["dc"] for _, _, s in subset]
        poly_vals = [s["pct_poly"] for _, _, s in subset]

        fk_m = statistics.mean(fk_vals)
        dc_m = statistics.mean(dc_vals)
        poly_m = statistics.mean(poly_vals)

        fk_gap = fk_m - easy_fk_mean
        dc_gap = dc_m - easy_dc_mean

        print(f"  {pctile:>7d}% {n:>11,} {max_comp:>+8.2f}"
              f" {fk_m:>8.2f} {dc_m:>9.2f} {poly_m:>8.1%}"
              f"  {fk_gap:>+8.2f}    {dc_gap:>+8.2f}")

    # Reference: Full Hard
    print(f"  {'Hard':>8s} {len(hard_scored):>11,} {'':>8s}"
          f" {fk_mean:>8.2f} {dc_mean:>9.2f} {poly_mean:>8.1%}"
          f"  {fk_mean - easy_fk_mean:>+8.2f}    {dc_mean - easy_dc_mean:>+8.2f}")

    # Detailed profile of a promising cutoff (20th percentile)
    for pick in [15, 20, 25]:
        n = int(len(hard_composites) * pick / 100)
        subset = hard_composites[:n]

        fk_vals = [s["fk"] for _, _, s in subset]
        dc_vals = [s["dc"] for _, _, s in subset]
        poly_vals = [s["pct_poly"] for _, _, s in subset]

        print(f"\n{'─' * 78}")
        print(f"  DETAILED PROFILE: Bottom {pick}% of Hard corpus ({n:,} articles)")
        print(f"{'─' * 78}")

        for label, vals, e_vals in [
            ("FK Grade", fk_vals, [s["fk"] for s in easy_scores]),
            ("Dale-Chall", dc_vals, [s["dc"] for s in easy_scores]),
            ("% Polysyllabic", poly_vals, [s["pct_poly"] for s in easy_scores]),
        ]:
            sm = summarize(vals)
            se = summarize(e_vals)
            print(f"\n  {label}:")
            print(f"    {'':8s} {'Mean':>8s} {'Median':>8s} {'P10':>8s} {'P25':>8s} {'P75':>8s} {'P90':>8s}")
            print(f"    {'Easy':8s} {se['mean']:>8.2f} {se['median']:>8.2f} {se['p10']:>8.2f} {se['p25']:>8.2f} {se['p75']:>8.2f} {se['p90']:>8.2f}")
            print(f"    {'Medium':8s} {sm['mean']:>8.2f} {sm['median']:>8.2f} {sm['p10']:>8.2f} {sm['p25']:>8.2f} {sm['p75']:>8.2f} {sm['p90']:>8.2f}")

    # Show where Easy articles would fall in the Hard composite distribution
    print(f"\n{'=' * 78}")
    print(f"  WHERE EASY ARTICLES FALL IN HARD COMPOSITE DISTRIBUTION")
    print(f"{'=' * 78}")
    easy_below = [0] * len(easy_composites)
    for i, ec in enumerate(easy_composites):
        # What percentile of Hard would this Easy article be?
        rank = sum(1 for c in comp_vals if c <= ec)
        easy_below[i] = rank / len(comp_vals) * 100
    eb = summarize(easy_below)
    print(f"\n  Easy articles' percentile rank in Hard composite:")
    print(f"    Mean: {eb['mean']:.1f}%ile  Median: {eb['median']:.1f}%ile")
    print(f"    P10:  {eb['p10']:.1f}%ile   P90: {eb['p90']:.1f}%ile")
    print(f"\n  Interpretation: the median Easy article is easier than")
    print(f"  {eb['median']:.0f}% of Hard articles by this composite.")


if __name__ == "__main__":
    main()
