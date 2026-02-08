#!/usr/bin/env python3
"""
Compare readability metrics across Easy and Hard corpus tiers.

Metrics computed per article:
  1. FK Grade Level         — sentence length + syllable density (already stored)
  2. Dale-Chall Score       — % unfamiliar words (not in top-3000 list) + sentence length
  3. Word Frequency Rank    — mean log-frequency of each word (via wordfreq)
  4. % Rare Words           — fraction of words outside the top-5000 by frequency
  5. Type-Token Ratio (TTR) — unique words / total words (vocabulary diversity)
  6. % Polysyllabic         — fraction of words with 3+ syllables
  7. Mean Word Length        — average characters per word

Usage:
    uv run analyze_readability.py
"""

import json
import math
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

try:
    from wordfreq import zipf_frequency
except ImportError:
    print("Installing wordfreq...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "wordfreq"])
    from wordfreq import zipf_frequency


# ---------------------------------------------------------------------------
# Text analysis helpers
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


def analyze_article(text: str) -> dict:
    """Compute all readability metrics for a single article."""
    raw_words = text.split()
    n_words = len(raw_words)
    if n_words == 0:
        return None

    n_sents = max(1, len(re.findall(r"[.!?]+", text)))

    # Extract alphabetic tokens for vocabulary analysis
    alpha_words = _WORD_RE.findall(text.lower())
    n_alpha = len(alpha_words)
    if n_alpha == 0:
        return None

    # --- FK Grade Level ---
    n_syllables = sum(count_syllables(w) for w in raw_words)
    fk_grade = 0.39 * (n_words / n_sents) + 11.8 * (n_syllables / n_words) - 15.59

    # --- Word frequency metrics (via wordfreq Zipf scale: 0=never, ~7=the) ---
    zipf_scores = [zipf_frequency(w, "en") for w in alpha_words]
    mean_zipf = statistics.mean(zipf_scores)

    # % rare words: Zipf < 3.0 roughly corresponds to outside top-5000
    n_rare = sum(1 for z in zipf_scores if z < 3.0)
    pct_rare = n_rare / n_alpha

    # --- Dale-Chall approximation ---
    # "Familiar" = Zipf >= 4.0 (~top 3000 words)
    n_unfamiliar = sum(1 for z in zipf_scores if z < 4.0)
    pct_unfamiliar = (n_unfamiliar / n_alpha) * 100
    dale_chall = 0.1579 * pct_unfamiliar + 0.0496 * (n_words / n_sents)
    if pct_unfamiliar > 5:
        dale_chall += 3.6365

    # --- Type-Token Ratio ---
    unique_words = set(alpha_words)
    ttr = len(unique_words) / n_alpha

    # --- % Polysyllabic (3+ syllables) ---
    n_poly = sum(1 for w in alpha_words if count_syllables(w) >= 3)
    pct_poly = n_poly / n_alpha

    # --- Mean word length (characters) ---
    mean_word_len = statistics.mean(len(w) for w in alpha_words)

    return {
        "fk_grade": round(fk_grade, 2),
        "dale_chall": round(dale_chall, 2),
        "mean_zipf": round(mean_zipf, 3),
        "pct_rare": round(pct_rare, 4),
        "ttr": round(ttr, 4),
        "pct_poly": round(pct_poly, 4),
        "mean_word_len": round(mean_word_len, 2),
        "words": n_words,
        "sentences": n_sents,
    }


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------

def summarize(values: list[float]) -> dict:
    if not values:
        return {}
    s = sorted(values)
    n = len(s)
    return {
        "mean": round(statistics.mean(s), 2),
        "median": round(statistics.median(s), 2),
        "stdev": round(statistics.stdev(s), 2) if n > 1 else 0,
        "p10": round(s[int(n * 0.10)], 2),
        "p25": round(s[int(n * 0.25)], 2),
        "p75": round(s[int(n * 0.75)], 2),
        "p90": round(s[int(n * 0.90)], 2),
        "min": round(s[0], 2),
        "max": round(s[-1], 2),
    }


def print_comparison(metric_name: str, easy_vals: list[float], hard_vals: list[float]):
    e = summarize(easy_vals)
    h = summarize(hard_vals)
    gap = round(h["mean"] - e["mean"], 2) if e and h else "N/A"
    sep_d = cohen_d(easy_vals, hard_vals)

    print(f"\n{'─' * 70}")
    print(f"  {metric_name}  (Cohen's d = {sep_d})")
    print(f"{'─' * 70}")
    print(f"  {'':12s} {'Mean':>8s} {'Median':>8s} {'StDev':>8s} {'P10':>8s} {'P25':>8s} {'P75':>8s} {'P90':>8s}")
    print(f"  {'Easy':12s} {e['mean']:8.2f} {e['median']:8.2f} {e['stdev']:8.2f} {e['p10']:8.2f} {e['p25']:8.2f} {e['p75']:8.2f} {e['p90']:8.2f}")
    print(f"  {'Hard':12s} {h['mean']:8.2f} {h['median']:8.2f} {h['stdev']:8.2f} {h['p10']:8.2f} {h['p25']:8.2f} {h['p75']:8.2f} {h['p90']:8.2f}")
    print(f"  Gap (Hard − Easy): {gap}")


def cohen_d(a: list[float], b: list[float]) -> str:
    """Effect size: how well this metric separates the two tiers."""
    if len(a) < 2 or len(b) < 2:
        return "N/A"
    ma, mb = statistics.mean(a), statistics.mean(b)
    va, vb = statistics.variance(a), statistics.variance(b)
    pooled_sd = math.sqrt((va + vb) / 2)
    if pooled_sd == 0:
        return "N/A"
    d = (mb - ma) / pooled_sd
    return f"{d:+.2f}"


# ---------------------------------------------------------------------------
# Histogram (terminal-friendly)
# ---------------------------------------------------------------------------

def print_histogram(label: str, easy_vals: list[float], hard_vals: list[float],
                    bin_min: float, bin_max: float, n_bins: int = 20):
    """Print overlapping ASCII histogram for two distributions."""
    bin_width = (bin_max - bin_min) / n_bins

    def bin_counts(vals):
        counts = [0] * n_bins
        for v in vals:
            idx = int((v - bin_min) / bin_width)
            idx = max(0, min(n_bins - 1, idx))
            counts[idx] += 1
        # Normalize to fractions
        total = len(vals) if vals else 1
        return [c / total for c in counts]

    e_counts = bin_counts(easy_vals)
    h_counts = bin_counts(hard_vals)
    max_frac = max(max(e_counts), max(h_counts), 0.001)
    bar_width = 40

    print(f"\n  {label}")
    print(f"  {'':8s} Easy ▓  Hard ░")
    for i in range(n_bins):
        lo = bin_min + i * bin_width
        e_bar = int(e_counts[i] / max_frac * bar_width)
        h_bar = int(h_counts[i] / max_frac * bar_width)
        # Overlap: show ▓ for easy, ░ for hard, █ for overlap
        row = [' '] * bar_width
        for j in range(h_bar):
            row[j] = '░'
        for j in range(e_bar):
            row[j] = '█' if row[j] == '░' else '▓'
        print(f"  {lo:7.1f} |{''.join(row)}|")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_corpus(path: Path) -> list[dict]:
    articles = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                articles.append(json.loads(line))
    return articles


def main():
    script_dir = Path(__file__).parent
    easy_path = script_dir / "corpus-easy.jsonl"
    hard_path = script_dir / "corpus-hard.jsonl"

    if not easy_path.exists() or not hard_path.exists():
        print("Error: corpus-easy.jsonl and corpus-hard.jsonl must exist in the script directory.")
        sys.exit(1)

    print("Loading corpora...")
    easy_articles = load_corpus(easy_path)
    hard_articles = load_corpus(hard_path)
    print(f"  Easy: {len(easy_articles)} articles")
    print(f"  Hard: {len(hard_articles)} articles")

    # Sample hard tier for tractable analysis (full tier is ~50k)
    import random
    random.seed(42)
    hard_sample_size = 1000
    if len(hard_articles) > hard_sample_size:
        hard_sample = random.sample(hard_articles, hard_sample_size)
        print(f"  Hard sampled to {hard_sample_size} for analysis")
    else:
        hard_sample = hard_articles

    print("\nAnalyzing articles (this may take a moment for wordfreq lookups)...")

    metrics = defaultdict(lambda: {"easy": [], "hard": []})

    for tier_name, articles in [("easy", easy_articles), ("hard", hard_sample)]:
        for art in articles:
            result = analyze_article(art["text"])
            if result is None:
                continue
            for key in ["fk_grade", "dale_chall", "mean_zipf", "pct_rare",
                        "ttr", "pct_poly", "mean_word_len"]:
                metrics[key][tier_name].append(result[key])

    # Print comparisons
    metric_labels = {
        "fk_grade":      "FK Grade Level (sentence length + syllables)",
        "dale_chall":    "Dale-Chall Score (% unfamiliar words + sentence length)",
        "mean_zipf":     "Mean Zipf Frequency (higher = more common words)",
        "pct_rare":      "% Rare Words (Zipf < 3.0, outside ~top 5000)",
        "ttr":           "Type-Token Ratio (vocabulary diversity)",
        "pct_poly":      "% Polysyllabic Words (3+ syllables)",
        "mean_word_len": "Mean Word Length (characters)",
    }

    print("\n" + "=" * 70)
    print("  READABILITY METRIC COMPARISON: Easy vs Hard")
    print("=" * 70)

    for key, label in metric_labels.items():
        print_comparison(label, metrics[key]["easy"], metrics[key]["hard"])

    # Histograms for the most interesting metrics
    print("\n\n" + "=" * 70)
    print("  DISTRIBUTIONS")
    print("=" * 70)

    print_histogram("FK Grade Level", metrics["fk_grade"]["easy"], metrics["fk_grade"]["hard"], 0, 25)
    print_histogram("Dale-Chall Score", metrics["dale_chall"]["easy"], metrics["dale_chall"]["hard"], 4, 14)
    print_histogram("Mean Zipf Frequency", metrics["mean_zipf"]["easy"], metrics["mean_zipf"]["hard"], 3.0, 5.5)
    print_histogram("% Rare Words", metrics["pct_rare"]["easy"], metrics["pct_rare"]["hard"], 0, 0.5)
    print_histogram("% Polysyllabic", metrics["pct_poly"]["easy"], metrics["pct_poly"]["hard"], 0, 0.4)

    # Correlation matrix
    print("\n\n" + "=" * 70)
    print("  INTER-METRIC CORRELATIONS (Hard tier sample)")
    print("=" * 70)
    keys = ["fk_grade", "dale_chall", "mean_zipf", "pct_rare", "pct_poly", "mean_word_len", "ttr"]
    short = ["FK", "D-C", "Zipf", "%Rare", "%Poly", "WdLen", "TTR"]

    print(f"\n  {'':8s}", end="")
    for s in short:
        print(f"{s:>8s}", end="")
    print()

    for i, ki in enumerate(keys):
        print(f"  {short[i]:8s}", end="")
        vi = metrics[ki]["hard"]
        for j, kj in enumerate(keys):
            vj = metrics[kj]["hard"]
            if len(vi) != len(vj) or len(vi) < 2:
                print(f"{'N/A':>8s}", end="")
                continue
            # Pearson correlation
            mi, mj = statistics.mean(vi), statistics.mean(vj)
            cov = sum((a - mi) * (b - mj) for a, b in zip(vi, vj)) / (len(vi) - 1)
            si = statistics.stdev(vi)
            sj = statistics.stdev(vj)
            r = cov / (si * sj) if si > 0 and sj > 0 else 0
            print(f"{r:8.2f}", end="")
        print()

    # Summary recommendation
    print("\n\n" + "=" * 70)
    print("  SEPARATION POWER RANKING (|Cohen's d|)")
    print("=" * 70)
    rankings = []
    for key, label in metric_labels.items():
        e, h = metrics[key]["easy"], metrics[key]["hard"]
        if len(e) >= 2 and len(h) >= 2:
            ma, mb = statistics.mean(e), statistics.mean(h)
            va, vb = statistics.variance(e), statistics.variance(h)
            pooled = math.sqrt((va + vb) / 2)
            d = abs((mb - ma) / pooled) if pooled > 0 else 0
            rankings.append((d, key, label))
    rankings.sort(reverse=True)
    print()
    for d, key, label in rankings:
        bar = "█" * int(d * 10)
        print(f"  {d:5.2f}  {bar:20s}  {label}")


if __name__ == "__main__":
    main()
