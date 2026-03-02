#!/usr/bin/env python3
"""Prototype: Convert a PDF with Docling into Reader-ready chapter .txt files.

This utility is intentionally conservative and text-first:
- Converts PDF -> Docling markdown with placeholder image/formula markers.
- Rewrites markers into Reader contract:
  - [FIGURE:<id>]
  - [FIGURE <caption>]
  - [EQN_IMAGE:<n>]
- Splits output into chapter/section files using heading regex boundaries.

Use this as a preprocessing helper, not as a runtime Reader dependency.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


IMAGE_PLACEHOLDER = '<!-- image -->'
FORMULA_PLACEHOLDER = '<!-- formula-not-decoded -->'
HEADING_RE = re.compile(r'^#{1,6}\s+(.+?)\s*$')
FIGURE_HEADING_RE = re.compile(r'^(?:#{1,6}\s+)?FIGURE\b[:\s.-]*(.*)$', re.IGNORECASE)
HTML_COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)
TABLE_ROW_RE = re.compile(r'^\s*\|')
TABLE_RULE_RE = re.compile(r'^\s*[:\-\|\s]+\s*$')


@dataclass
class Section:
  title: str
  blocks: list[str]
  is_frontmatter: bool = False


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description='Convert a PDF with Docling and emit Reader-ready chapter text files.'
  )
  parser.add_argument('--input-pdf', required=True, help='Source PDF path.')
  parser.add_argument(
    '--output-dir',
    required=True,
    help='Target Reader directory, e.g. library/references/book-slug',
  )
  parser.add_argument(
    '--chapter-regex',
    action='append',
    default=[],
    help=(
      'Regex applied to markdown heading text to start a new section. '
      'Repeat for multiple boundaries.'
    ),
  )
  parser.add_argument(
    '--keep-frontmatter',
    action='store_true',
    help='Keep content before first chapter heading as 00-frontmatter.txt.',
  )
  parser.add_argument(
    '--pdf-backend',
    choices=('pypdfium2', 'docling_parse'),
    default='pypdfium2',
    help='Docling PDF backend (pypdfium2 is usually faster on born-digital PDFs).',
  )
  parser.add_argument(
    '--ocr',
    action='store_true',
    help='Enable OCR in Docling pipeline (default: off).',
  )
  parser.add_argument(
    '--export-figure-images',
    action='store_true',
    help='Export figure images to images/<id>.jpg using reading-order picture items.',
  )
  parser.add_argument(
    '--save-raw-markdown',
    action='store_true',
    help='Save Docling markdown snapshot to _docling_raw.md in output dir.',
  )
  parser.add_argument(
    '--drop-markdown-tables',
    action='store_true',
    help='Drop markdown table rows from output blocks.',
  )
  return parser.parse_args()


def slugify(text: str) -> str:
  base = text.strip().lower()
  base = re.sub(r'[`\'"“”‘’]', '', base)
  base = re.sub(r'&', ' and ', base)
  base = re.sub(r'[^a-z0-9]+', '-', base)
  base = re.sub(r'-{2,}', '-', base).strip('-')
  return base or 'section'


def normalize_whitespace(text: str) -> str:
  text = html.unescape(text.replace('\r\n', '\n').replace('\r', '\n'))
  text = text.replace('\u00a0', ' ')
  return text


def split_blocks(markdown_text: str) -> list[str]:
  raw = re.split(r'\n\s*\n', markdown_text)
  blocks: list[str] = []
  for block in raw:
    lines = [line.rstrip() for line in block.splitlines()]
    cleaned = '\n'.join(lines).strip()
    if cleaned:
      blocks.append(cleaned)
  return blocks


def trim_figure_label(label: str) -> str:
  text = label.strip()
  if not text:
    return text
  text = re.sub(r'^[0-9]+(?:\.[0-9]+)*\s*[:.-]?\s*', '', text)
  return text.strip()


def rewrite_markers(
  blocks: list[str],
  *,
  drop_markdown_tables: bool = False,
) -> tuple[list[str], list[str], int]:
  rewritten: list[str] = []
  figure_ids: list[str] = []
  figure_index = 0
  eqn_index = 0

  i = 0
  while i < len(blocks):
    block = blocks[i].strip()

    if block == IMAGE_PLACEHOLDER:
      figure_index += 1
      figure_id = f'fig_{figure_index:03d}'
      figure_ids.append(figure_id)
      caption: str | None = None

      if i + 1 < len(blocks):
        candidate = blocks[i + 1].strip()
        match = FIGURE_HEADING_RE.match(candidate)
        if match:
          captured = trim_figure_label(match.group(1))
          if captured:
            caption = captured
          i += 1

      out = [f'[FIGURE:{figure_id}]']
      if caption:
        out.append(f'[FIGURE {caption}]')
      rewritten.append('\n'.join(out))
      i += 1
      continue

    while FORMULA_PLACEHOLDER in block:
      eqn_index += 1
      block = block.replace(FORMULA_PLACEHOLDER, f'[EQN_IMAGE:{eqn_index}]', 1)

    # Remove comments other than handled image/formula placeholders.
    block = HTML_COMMENT_RE.sub('', block).strip()
    if not block:
      i += 1
      continue

    if drop_markdown_tables:
      kept_lines: list[str] = []
      for line in block.splitlines():
        if TABLE_ROW_RE.match(line):
          continue
        if TABLE_RULE_RE.match(line):
          continue
        kept_lines.append(line)
      block = '\n'.join(kept_lines).strip()
      if not block:
        i += 1
        continue

    rewritten.append(block)
    i += 1

  return rewritten, figure_ids, eqn_index


def heading_text(block: str) -> str | None:
  first = block.splitlines()[0].strip()
  match = HEADING_RE.match(first)
  if not match:
    return None
  return match.group(1).strip()


def strip_heading_markup(block: str) -> str:
  lines = block.splitlines()
  if not lines:
    return block
  match = HEADING_RE.match(lines[0].strip())
  if not match:
    return block
  lines[0] = match.group(1).strip()
  return '\n'.join(lines).strip()


def matches_any_regex(text: str, compiled: Iterable[re.Pattern[str]]) -> bool:
  return any(pattern.search(text) for pattern in compiled)


def split_sections(
  blocks: list[str],
  chapter_patterns: list[re.Pattern[str]],
  keep_frontmatter: bool,
) -> list[Section]:
  if not chapter_patterns:
    return [Section(title='full-text', blocks=blocks, is_frontmatter=False)]

  sections: list[Section] = []
  current_title = 'frontmatter'
  current_blocks: list[str] = []
  seen_heading = False

  def flush() -> None:
    nonlocal current_title, current_blocks
    if not current_blocks:
      return
    section = Section(
      title=current_title,
      blocks=current_blocks[:],
      is_frontmatter=(not seen_heading and current_title == 'frontmatter'),
    )
    sections.append(section)
    current_blocks = []

  for block in blocks:
    maybe_heading = heading_text(block)
    if maybe_heading and matches_any_regex(maybe_heading, chapter_patterns):
      if not seen_heading:
        flush()
        seen_heading = True
      else:
        flush()
      current_title = maybe_heading
      current_blocks = [strip_heading_markup(block)]
      continue
    current_blocks.append(block)

  flush()

  # If no heading matched the configured chapter patterns, keep a single file.
  if not seen_heading:
    return [Section(title='full-text', blocks=blocks, is_frontmatter=False)]

  if keep_frontmatter:
    return [section for section in sections if section.blocks]

  trimmed: list[Section] = []
  dropped_frontmatter = True
  for section in sections:
    if dropped_frontmatter and section.is_frontmatter:
      continue
    dropped_frontmatter = False
    trimmed.append(section)

  return trimmed


def unique_filename(base_name: str, used: set[str]) -> str:
  candidate = base_name
  suffix = 2
  while candidate in used:
    candidate = f'{base_name}-{suffix}'
    suffix += 1
  used.add(candidate)
  return candidate


def write_sections(output_dir: Path, sections: list[Section]) -> list[Path]:
  output_dir.mkdir(parents=True, exist_ok=True)
  written: list[Path] = []
  used_names: set[str] = set()
  width = max(2, len(str(len(sections))))

  for index, section in enumerate(sections):
    slug = slugify(section.title)
    file_stem = unique_filename(f'{index:0{width}d}-{slug}', used_names)
    target = output_dir / f'{file_stem}.txt'
    body = '\n\n'.join(block.strip() for block in section.blocks if block.strip()).strip()
    if not body:
      continue
    target.write_text(body + '\n', encoding='utf-8')
    written.append(target)

  return written


def export_figure_images(
  output_dir: Path,
  *,
  conv_result,
  figure_ids: list[str],
) -> int:
  if not figure_ids:
    return 0

  try:
    from docling_core.types.doc import ImageRefMode
    from PIL import Image
  except Exception as exc:
    print(f'WARNING: missing image export dependencies; skipping figure export: {exc}', file=sys.stderr)
    return 0

  images_dir = output_dir / 'images'
  images_dir.mkdir(parents=True, exist_ok=True)

  with tempfile.TemporaryDirectory(prefix='reader-docling-images-') as tmp_dir:
    tmp_root = Path(tmp_dir)
    referenced_md = tmp_root / 'referenced.md'
    conv_result.document.save_as_markdown(referenced_md, image_mode=ImageRefMode.REFERENCED)
    md_text = referenced_md.read_text(encoding='utf-8')

    seen: set[Path] = set()
    ordered_sources: list[Path] = []
    for match in re.finditer(r'!\[[^\]]*\]\(([^)]+\.(?:png|jpg|jpeg|webp))\)', md_text, re.IGNORECASE):
      raw_path = match.group(1).strip().split()[0]
      candidate = Path(raw_path)
      source = candidate if candidate.is_absolute() else (tmp_root / candidate).resolve()
      if not source.exists() or source in seen:
        continue
      seen.add(source)
      ordered_sources.append(source)

    exported = 0
    for figure_id, source in zip(figure_ids, ordered_sources):
      target = images_dir / f'{figure_id}.jpg'
      try:
        with Image.open(source) as image:
          image.convert('RGB').save(target, format='JPEG', quality=90)
        exported += 1
      except Exception as exc:
        print(f'WARNING: failed to convert {source.name} -> {target.name}: {exc}', file=sys.stderr)

    return exported


def build_docling_converter(pdf_backend: str, do_ocr: bool, include_images: bool):
  try:
    from docling.backend.docling_parse_backend import DoclingParseDocumentBackend
    from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
  except Exception as exc:
    raise RuntimeError(
      'Missing Docling dependencies. Install Docling first, e.g.:\n'
      '  uvx --python 3.12 --from docling docling --version'
    ) from exc

  backend_cls = (
    PyPdfiumDocumentBackend if pdf_backend == 'pypdfium2' else DoclingParseDocumentBackend
  )
  pipeline_options = PdfPipelineOptions(do_ocr=do_ocr)
  if include_images:
    pipeline_options.generate_page_images = True
    pipeline_options.generate_picture_images = True
    pipeline_options.images_scale = 2.0
  return DocumentConverter(
    format_options={
      InputFormat.PDF: PdfFormatOption(
        pipeline_options=pipeline_options,
        backend=backend_cls,
      )
    }
  )


def export_markdown_with_placeholders(conv_result) -> str:
  try:
    from docling_core.types.doc import ImageRefMode
  except Exception:
    # Fallback to default export behavior if ImageRefMode is unavailable.
    return conv_result.document.export_to_markdown()

  return conv_result.document.export_to_markdown(image_mode=ImageRefMode.PLACEHOLDER)


def main() -> int:
  args = parse_args()
  input_pdf = Path(args.input_pdf).expanduser().resolve()
  output_dir = Path(args.output_dir).expanduser().resolve()

  if not input_pdf.exists():
    print(f'ERROR: input PDF not found: {input_pdf}', file=sys.stderr)
    return 1

  chapter_patterns: list[re.Pattern[str]] = []
  for raw in args.chapter_regex:
    try:
      chapter_patterns.append(re.compile(raw, re.IGNORECASE))
    except re.error as exc:
      print(f'ERROR: invalid --chapter-regex "{raw}": {exc}', file=sys.stderr)
      return 1

  converter = build_docling_converter(
    args.pdf_backend,
    args.ocr,
    include_images=args.export_figure_images,
  )
  print(f'Converting with Docling: {input_pdf}')
  conv_result = converter.convert(str(input_pdf))

  markdown_text = normalize_whitespace(export_markdown_with_placeholders(conv_result))
  if args.save_raw_markdown:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / '_docling_raw.md').write_text(markdown_text, encoding='utf-8')

  raw_blocks = split_blocks(markdown_text)
  rewritten_blocks, figure_ids, eqn_count = rewrite_markers(
    raw_blocks,
    drop_markdown_tables=args.drop_markdown_tables,
  )
  sections = split_sections(
    rewritten_blocks,
    chapter_patterns=chapter_patterns,
    keep_frontmatter=args.keep_frontmatter,
  )

  if not sections:
    print('ERROR: no sections produced. Check chapter regexes or input quality.', file=sys.stderr)
    return 1

  written_files = write_sections(output_dir, sections)
  if not written_files:
    print('ERROR: no non-empty files were written.', file=sys.stderr)
    return 1

  exported_images = 0
  if args.export_figure_images:
    exported_images = export_figure_images(
      output_dir,
      conv_result=conv_result,
      figure_ids=figure_ids,
    )

  print('\nDone.')
  print(f'Output dir: {output_dir}')
  print(f'Chapter files written: {len(written_files)}')
  print(f'Figure markers: {len(figure_ids)}')
  print(f'Equation placeholders: {eqn_count}')
  if args.export_figure_images:
    print(f'Figure images exported: {exported_images}')

  return 0


if __name__ == '__main__':
  raise SystemExit(main())
