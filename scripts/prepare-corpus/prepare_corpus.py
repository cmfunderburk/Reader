#!/usr/bin/env python3
"""Prepare Wikipedia corpus for Reader's Random Drill mode.

Downloads lead sections from Wikipedia's Good and Featured articles,
cleans them, and outputs one JSONL line per article (whole intro text).
Supports tiered difficulty:

  Easy:   Simple English Wikipedia (--wiki simple --tier easy)
  Medium: Regular Wikipedia, FK grade ≤ 10 (--tier medium --fk-max 10)
  Hard:   Regular Wikipedia, unfiltered (--tier hard)

Usage:
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm

    # Easy tier from Simple English Wikipedia
    python prepare_corpus.py --wiki simple --tier easy

    # Medium tier with Flesch-Kincaid filter
    python prepare_corpus.py --tier medium --fk-max 10

    # Hard tier (current behavior, default)
    python prepare_corpus.py --tier hard

The script caches raw API responses, so it can be interrupted and resumed
without re-fetching already-downloaded data.
"""

import argparse
import json
import re
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

import requests
import spacy
from tqdm import tqdm


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WIKI_API = "https://en.wikipedia.org/w/api.php"
SIMPLE_WIKI_API = "https://simple.wikipedia.org/w/api.php"
USER_AGENT = (
    "ReaderCorpusBuilder/1.0 "
    "(speed reading training app; https://github.com/cmfunderburk/Reader)"
)
BATCH_SIZE = 20          # max titles per MediaWiki query request
REQUEST_DELAY = 0.25     # seconds between API requests
CM_PAGE_SIZE = 500       # categorymembers page size (max 500)

EN_CATEGORIES = [
    "Category:Good articles",
    "Category:Featured articles",
]

SIMPLE_CATEGORIES = [
    "Category:Good articles",
    "Category:Very good articles",
]

# Coarse domain labels, keyed by keyword fragments matched against categories
DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "Sciences": [
        "biology", "species", "organism", "chemical", "chemistry",
        "physics", "astronomy", "geology", "ecology", "anatomy",
        "medicine", "disease", "genetic", "cell biology", "molecular",
        "neuroscience", "zoology", "botany", "paleontology", "evolution",
        "mineral", "element", "biochem", "virology", "immunology",
        "pharmacology", "meteorology", "oceanography",
    ],
    "Technology & Engineering": [
        "technology", "engineering", "computer", "software", "programming",
        "electronics", "telecommunications", "aviation", "automobile",
        "railway", "bridge", "spacecraft", "robotics", "internet",
    ],
    "Mathematics": [
        "mathematics", "theorem", "algebra", "geometry", "topology",
        "number theory", "statistics", "probability", "combinatorics",
    ],
    "History": [
        "history", "war ", "battle", "ancient", "medieval", "century",
        "empire", "dynasty", "revolution", "colonial", "world war",
    ],
    "Geography & Places": [
        "geography", "countries", "cities", "islands", "rivers",
        "mountains", "regions", "states of", "provinces", "territories",
        "counties", "districts", "villages", "towns", "populated places",
        "neighborhoods",
    ],
    "Arts & Culture": [
        "art", "music", "films", "literature", "novels", "albums",
        "songs", "painting", "sculpture", "theatre", "dance", "poetry",
        "television", "video game", "anime", "manga", "comics",
    ],
    "Philosophy & Religion": [
        "philosophy", "religion", "theology", "ethics", "churches",
        "temples", "mosques", "buddhis", "hinduis", "christianity",
        "islam", "judais", "spiritual",
    ],
    "Social Sciences": [
        "economics", "sociology", "psychology", "politic", "law",
        "government", "election", "education", "language", "linguistics",
        "anthropology", "archaeology", "criminology",
    ],
    "Sports": [
        "sport", "football", "baseball", "basketball", "cricket",
        "rugby", "tennis", "olympic", "athlete", "championship",
        "tournament", "soccer", "hockey", "cycling", "motorsport",
    ],
}


# ---------------------------------------------------------------------------
# Wikipedia API helpers
# ---------------------------------------------------------------------------

def fetch_category_members(
    category: str, session: requests.Session, api_url: str = WIKI_API
) -> list[str]:
    """Fetch all article titles in a Wikipedia category (non-recursive)."""
    titles = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": category,
        "cmlimit": CM_PAGE_SIZE,
        "cmtype": "page",
        "cmnamespace": 0,       # main namespace only
        "format": "json",
    }

    while True:
        resp = session.get(api_url, params=params)
        resp.raise_for_status()
        data = resp.json()

        for member in data["query"]["categorymembers"]:
            titles.append(member["title"])

        if "continue" in data:
            params["cmcontinue"] = data["continue"]["cmcontinue"]
            time.sleep(REQUEST_DELAY)
        else:
            break

    return titles


def fetch_extracts_batch(
    titles: list[str], session: requests.Session, api_url: str = WIKI_API
) -> dict[str, dict]:
    """Fetch lead sections and categories for a batch of up to 20 titles."""
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": "extracts|categories",
        "exintro": True,
        "explaintext": True,
        "clshow": "!hidden",
        "cllimit": "max",
        "format": "json",
    }

    resp = session.get(api_url, params=params)
    resp.raise_for_status()
    data = resp.json()

    results = {}
    for page_id, page in data.get("query", {}).get("pages", {}).items():
        if int(page_id) < 0:       # missing / invalid page
            continue
        title = page.get("title", "")
        extract = page.get("extract", "")
        categories = [
            c["title"].replace("Category:", "")
            for c in page.get("categories", [])
        ]
        if extract:
            results[title] = {"extract": extract, "categories": categories}

    return results


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

def clean_citations(text: str) -> str:
    """Remove [1], [note 2], [a], [citation needed], etc."""
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\[note \d+\]", "", text)
    text = re.sub(r"\[[a-z]\]", "", text)
    text = re.sub(r"\[citation needed\]", "", text, flags=re.IGNORECASE)
    return text


# Patterns inside parentheticals that signal strippable content
_STRIP_PAREN_PATTERNS = [
    re.compile(r"/[^/]+/"),                         # IPA transcriptions
    re.compile(r"[ˈˌːʃʒθðŋɪʊɛɔɑəæɒʌɜɐ]"),         # IPA characters
    re.compile(r"\balso known as\b", re.I),
    re.compile(r"\babbreviated?\b", re.I),
    re.compile(r"\bformerly\b", re.I),
    re.compile(r"\bor simply\b", re.I),
    re.compile(r"\blit\.\s", re.I),
    re.compile(
        r"\bfrom (?:Latin|Greek|French|German|Spanish|Italian|Arabic|"
        r"Japanese|Chinese|Sanskrit|Old English|Middle English|Proto)",
        re.I,
    ),
    re.compile(
        r"(?:Latin|Greek|French|German|Spanish|Italian|Arabic|"
        r"Japanese|Chinese|Hindi|Russian|Portuguese|Korean|Turkish):\s",
    ),
]


def _should_strip_paren(content: str) -> bool:
    """Decide whether a parenthetical's content warrants removal."""
    for pat in _STRIP_PAREN_PATTERNS:
        if pat.search(content):
            return True
    # Long parentheticals (>10 words) are likely disambiguation, not content
    if len(content.split()) > 10:
        return True
    return False


def _find_top_level_parens(text: str) -> list[tuple[int, int, str]]:
    """Find top-level parenthetical groups, handling nesting."""
    groups = []
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "(":
            if depth == 0:
                start = i
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0 and start >= 0:
                groups.append((start, i + 1, text[start + 1 : i]))
                start = -1
    return groups


def clean_first_sentence_parentheticals(text: str) -> str:
    """Strip IPA / etymology / alias parentheticals from the first sentence."""
    # Isolate the first sentence (up to first sentence-ending punctuation
    # followed by whitespace and a capital letter, or end of string).
    m = re.match(r"^(.*?[.!?])\s+(?=[A-Z])", text, re.DOTALL)
    if m:
        first_sent = m.group(1)
        rest = text[m.end() - 1:]   # keep the space before the capital
    else:
        first_sent = text
        rest = ""

    # Find top-level parenthetical groups and strip any that match criteria.
    # Process right-to-left so indices stay valid after removal.
    groups = _find_top_level_parens(first_sent)
    for start, end, content in reversed(groups):
        if _should_strip_paren(content):
            before = first_sent[:start].rstrip()
            after = first_sent[end:].lstrip()
            first_sent = before + " " + after
            first_sent = re.sub(r"  +", " ", first_sent)

    return (first_sent + rest).strip()


def clean_text(text: str) -> str:
    """Full cleaning pipeline for a lead section."""
    text = clean_citations(text)
    text = clean_first_sentence_parentheticals(text)
    text = re.sub(r"\s+", " ", text).strip()     # normalize whitespace
    text = re.sub(r"'{2,3}", "", text)            # residual bold/italic
    return text




# ---------------------------------------------------------------------------
# Flesch-Kincaid readability
# ---------------------------------------------------------------------------

_VOWELS = set("aeiouyAEIOUY")


def count_syllables(word: str) -> int:
    """Estimate syllable count using vowel-group heuristic."""
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
    # Subtract silent-e
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def flesch_kincaid_grade(text: str) -> float:
    """Compute Flesch-Kincaid Grade Level for a text chunk."""
    words = text.split()
    n_words = len(words)
    if n_words == 0:
        return 0.0
    n_sents = max(1, len(re.findall(r"[.!?]+", text)))
    n_syllables = sum(count_syllables(w) for w in words)
    return 0.39 * (n_words / n_sents) + 11.8 * (n_syllables / n_words) - 15.59


# ---------------------------------------------------------------------------
# Domain tagging
# ---------------------------------------------------------------------------

def assign_domain(categories: list[str]) -> str:
    """Map an article's visible categories to a coarse domain label."""
    cat_text = " ".join(categories).lower()
    scores: dict[str, int] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in cat_text)
        if score:
            scores[domain] = score
    return max(scores, key=scores.get) if scores else "Other"


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def fetch_titles(
    session: requests.Session,
    cache_dir: Path,
    api_url: str = WIKI_API,
    categories: list[str] | None = None,
) -> list[str]:
    """Phase 1: get all GA + FA article titles (cached)."""
    if categories is None:
        categories = EN_CATEGORIES
    cache_file = cache_dir / "titles.json"
    if cache_file.exists():
        titles = json.loads(cache_file.read_text())
        print(f"Loaded {len(titles)} cached titles from {cache_file}")
        return titles

    all_titles: list[str] = []
    for cat in categories:
        print(f"Fetching titles from {cat} ...")
        titles = fetch_category_members(cat, session, api_url)
        print(f"  {len(titles):,} articles")
        all_titles.extend(titles)

    # Deduplicate (some articles hold both GA and FA status)
    all_titles = sorted(set(all_titles))
    print(f"Total unique titles: {len(all_titles):,}")

    cache_file.write_text(json.dumps(all_titles))
    return all_titles


def fetch_articles(
    titles: list[str],
    session: requests.Session,
    cache_dir: Path,
    api_url: str = WIKI_API,
) -> dict[str, dict]:
    """Phase 2: fetch lead extracts + categories for all titles (cached, resumable)."""
    cache_file = cache_dir / "articles.json"

    # Load any previously cached articles
    if cache_file.exists():
        articles = json.loads(cache_file.read_text())
        print(f"Loaded {len(articles):,} cached articles from {cache_file}")
    else:
        articles = {}

    # Figure out what still needs fetching
    remaining = [t for t in titles if t not in articles]
    if not remaining:
        print("All articles already cached.")
        return articles

    print(f"Fetching extracts for {len(remaining):,} remaining articles ...")
    batches = [remaining[i : i + BATCH_SIZE] for i in range(0, len(remaining), BATCH_SIZE)]

    save_every = 50  # save cache every N batches
    for i, batch in enumerate(tqdm(batches, desc="Fetching extracts")):
        try:
            results = fetch_extracts_batch(batch, session, api_url)
            articles.update(results)
        except Exception as e:
            print(f"\nError on batch {i}: {e}")
            # Save progress and continue
            cache_file.write_text(json.dumps(articles))
            continue
        time.sleep(REQUEST_DELAY)

        if (i + 1) % save_every == 0:
            cache_file.write_text(json.dumps(articles))

    # Final save
    cache_file.write_text(json.dumps(articles))
    print(f"Total articles with extracts: {len(articles):,}")
    return articles


def process_articles(
    articles: dict[str, dict], nlp, fk_max: float | None = None
) -> tuple[list[dict], Counter]:
    """Phase 3: clean and filter articles, output one entry per article."""
    all_articles: list[dict] = []
    stats = Counter()

    for title, data in tqdm(articles.items(), desc="Processing"):
        extract = data["extract"]
        categories = data["categories"]

        if not extract or len(extract.strip()) < 50:
            stats["skipped_empty"] += 1
            continue

        cleaned = clean_text(extract)
        doc = nlp(cleaned)
        sentences = list(doc.sents)
        n_sents = len(sentences)
        wc = len(cleaned.split())

        if n_sents < 3 or wc < 20:
            stats["skipped_short"] += 1
            continue

        fk = flesch_kincaid_grade(cleaned)
        if fk_max is not None and fk > fk_max:
            stats["skipped_fk"] += 1
            continue

        domain = assign_domain(categories)

        all_articles.append({
            "title": title,
            "text": cleaned,
            "domain": domain,
            "fk_grade": round(fk, 1),
            "words": wc,
            "sentences": n_sents,
        })
        stats[f"domain:{domain}"] += 1

    return all_articles, stats


def print_stats(raw_articles: dict, output_articles: list[dict], stats: Counter) -> None:
    """Print corpus statistics."""
    print(f"\n{'=' * 55}")
    print("Corpus Statistics")
    print(f"{'=' * 55}")
    print(f"Articles processed:    {len(raw_articles):>8,}")
    print(f"Articles output:       {len(output_articles):>8,}")
    print(f"Skipped (empty lead):  {stats.get('skipped_empty', 0):>8,}")
    print(f"Skipped (too short):   {stats.get('skipped_short', 0):>8,}")
    if stats.get("skipped_fk", 0) > 0:
        print(f"Skipped (FK grade):    {stats['skipped_fk']:>8,}")

    # Domain distribution
    domain_counts = {
        k.removeprefix("domain:"): v
        for k, v in stats.items()
        if k.startswith("domain:")
    }
    print("\nDomain distribution:")
    for domain, count in sorted(domain_counts.items(), key=lambda x: -x[1]):
        pct = 100 * count / len(output_articles) if output_articles else 0
        print(f"  {domain:30s} {count:>6,}  ({pct:5.1f}%)")

    if output_articles:
        fks = [a["fk_grade"] for a in output_articles]
        wcs = [a["words"] for a in output_articles]
        scs = [a["sentences"] for a in output_articles]
        print(
            f"\nFK grade:    mean={statistics.mean(fks):.1f}  "
            f"median={statistics.median(fks):.1f}  "
            f"min={min(fks):.1f}  max={max(fks):.1f}"
        )
        print(
            f"Word count:  mean={statistics.mean(wcs):.1f}  "
            f"median={statistics.median(wcs):.1f}  "
            f"min={min(wcs)}  max={max(wcs)}"
        )
        print(
            f"Sentences:   mean={statistics.mean(scs):.1f}  "
            f"median={statistics.median(scs):.1f}  "
            f"min={min(scs)}  max={max(scs)}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare Wikipedia GA/FA corpus for Random Drill mode."
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output JSONL file path (default: corpus-{tier}.jsonl)",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help="Cache directory for raw API responses (default: .corpus-cache or .corpus-cache-simple)",
    )
    parser.add_argument(
        "--wiki",
        choices=["en", "simple"],
        default="en",
        help="Wikipedia edition: en (default) or simple",
    )
    parser.add_argument(
        "--tier",
        choices=["easy", "medium", "hard"],
        default=None,
        help="Corpus tier name (default: inferred from --wiki — simple→easy, en→hard)",
    )
    parser.add_argument(
        "--fk-max",
        type=float,
        default=None,
        help="Maximum Flesch-Kincaid grade level (skip chunks above this). "
             "Default: 10.0 for medium tier, None otherwise",
    )
    args = parser.parse_args()

    # Resolve tier
    tier = args.tier
    if tier is None:
        tier = "easy" if args.wiki == "simple" else "hard"

    # Resolve FK filter
    fk_max = args.fk_max
    if fk_max is None and tier == "medium":
        fk_max = 10.0

    # Resolve API URL and categories
    if args.wiki == "simple":
        api_url = SIMPLE_WIKI_API
        categories = SIMPLE_CATEGORIES
    else:
        api_url = WIKI_API
        categories = EN_CATEGORIES

    # Resolve paths
    output_path = Path(args.output) if args.output else Path(f"corpus-{tier}.jsonl")
    cache_dir = Path(args.cache_dir) if args.cache_dir else Path(
        ".corpus-cache-simple" if args.wiki == "simple" else ".corpus-cache"
    )
    cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Tier: {tier}  Wiki: {args.wiki}  FK max: {fk_max}")

    # Load spaCy
    print("Loading spaCy model ...")
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        print("spaCy model not found. Install it with:")
        print("  python -m spacy download en_core_web_sm")
        sys.exit(1)
    nlp.max_length = 200_000

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    # Phase 1: titles
    titles = fetch_titles(session, cache_dir, api_url, categories)

    # Phase 2: extracts + categories
    articles = fetch_articles(titles, session, cache_dir, api_url)

    # Phase 3: process
    print("\nCleaning and filtering articles ...")
    output_articles, stats = process_articles(articles, nlp, fk_max)

    # Phase 4: write
    print(f"\nWriting {len(output_articles):,} articles to {output_path} ...")
    with open(output_path, "w") as f:
        for article in output_articles:
            f.write(json.dumps(article) + "\n")

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Output file: {output_path}  ({file_size_mb:.1f} MB)")

    print_stats(articles, output_articles, stats)


if __name__ == "__main__":
    main()
