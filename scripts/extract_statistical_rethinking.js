#!/usr/bin/env node

const EPub = require('epub');
const AdmZip = require('adm-zip');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const EPUB_PATH = 'library/Statistical Rethinking.epub';
const OUT_DIR = 'library/references/statistical-rethinking';
const OUT_IMAGE_DIR = path.join(OUT_DIR, 'images');
const REPORT_PATH = path.join(OUT_DIR, 'extraction-report.json');

const SUPER_MAP = {
  '0': '\u2070',
  '1': '\u00B9',
  '2': '\u00B2',
  '3': '\u00B3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
  '+': '\u207A',
  '-': '\u207B',
  '=': '\u207C',
  '(': '\u207D',
  ')': '\u207E',
  'n': '\u207F',
  'i': '\u2071',
};

const SUB_MAP = {
  '0': '\u2080',
  '1': '\u2081',
  '2': '\u2082',
  '3': '\u2083',
  '4': '\u2084',
  '5': '\u2085',
  '6': '\u2086',
  '7': '\u2087',
  '8': '\u2088',
  '9': '\u2089',
  '+': '\u208A',
  '-': '\u208B',
  '=': '\u208C',
  '(': '\u208D',
  ')': '\u208E',
  'a': '\u2090',
  'e': '\u2091',
  'h': '\u2095',
  'i': '\u1D62',
  'j': '\u2C7C',
  'k': '\u2096',
  'l': '\u2097',
  'm': '\u2098',
  'n': '\u2099',
  'o': '\u2092',
  'p': '\u209A',
  'r': '\u1D63',
  's': '\u209B',
  't': '\u209C',
  'u': '\u1D64',
  'v': '\u1D65',
  'x': '\u2093',
};

function superscript(text) {
  const chars = [...text];
  if (chars.every((ch) => Object.prototype.hasOwnProperty.call(SUPER_MAP, ch))) {
    return chars.map((ch) => SUPER_MAP[ch]).join('');
  }
  return `^{${text}}`;
}

function subscript(text) {
  const chars = [...text];
  if (chars.every((ch) => Object.prototype.hasOwnProperty.call(SUB_MAP, ch))) {
    return chars.map((ch) => SUB_MAP[ch]).join('');
  }
  return `_{${text}}`;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeInlineText(text) {
  return collapseWhitespace(text)
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+\]/g, ']')
    .replace(/\[\s+/g, '[');
}

function cleanMathText(text) {
  return normalizeInlineText(text)
    .replace(/\s*([=+\-×÷≈~<>≤≥])\s*/g, ' $1 ')
    .replace(/\s*([|])\s*/g, ' $1 ')
    .replace(/\b([A-Za-z]{2,})\s-\s([A-Za-z]{2,})\b/g, '$1-$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function replaceUnderbraceMarkers(text) {
  const marker = '_{︸}_{';
  let out = '';
  let cursor = 0;

  while (cursor < text.length) {
    const at = text.indexOf(marker, cursor);
    if (at === -1) {
      out += text.slice(cursor);
      break;
    }

    out += text.slice(cursor, at);
    let i = at + marker.length;
    let depth = 1;
    const contentStart = i;

    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }

    if (depth === 0) {
      const content = text.slice(contentStart, i - 1);
      out += ` [= ${content}]`;
      cursor = i;
    } else {
      out += marker;
      cursor = at + marker.length;
    }
  }

  return out;
}

function polishChapterText(text) {
  let out = text;
  out = replaceUnderbraceMarkers(out);
  out = out.replace(/~\s*\^\{iid\}\s*([A-Za-z]+)/g, '~ iid $1');
  out = out.replace(/\}_\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '} [= $1]');
  out = out.replace(/\|\s+,for\b/g, '| for');
  out = out.replace(/_\{︸\}/g, '');
  out = out.replace(/_\{︷\}/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out;
}

function flattenToc(items) {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      out.push(node);
      if (node.children && node.children.length) {
        walk(node.children);
      }
    }
  };
  walk(items || []);
  return out;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function chapterOutputName(chapterNumber, chapterTitle) {
  const stripped = chapterTitle.replace(/^Chapter\s+\d+\.\s*/i, '');
  return `${String(chapterNumber).padStart(2, '0')}-${slugify(stripped)}`;
}

function findChapterTitle(tocItems, href) {
  const hrefPath = href.split('#')[0];
  for (const item of tocItems) {
    if (!item || !item.href || !item.title) continue;
    const itemPath = item.href.split('#')[0];
    if (itemPath === hrefPath && /^Chapter\s+\d+\./i.test(item.title)) {
      return item.title.trim();
    }
  }
  return null;
}

function extractChapterNumber(title, fallback) {
  const match = title.match(/^Chapter\s+(\d+)\./i);
  if (match) return Number(match[1]);
  return fallback;
}

function renderMathNode(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();
  const kids = Array.from(node.childNodes || []);

  if (tag === 'math' || tag === 'mrow' || tag === 'mstyle' || tag === 'mtd') {
    return kids.map(renderMathNode).join('');
  }
  if (tag === 'mi' || tag === 'mn' || tag === 'mtext') {
    return node.textContent || '';
  }
  if (tag === 'mo') {
    return node.textContent || '';
  }
  if (tag === 'msup') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const exp = cleanMathText(renderMathNode(kids[1] || null));
    return `${base}${superscript(exp)}`;
  }
  if (tag === 'msub') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const sub = cleanMathText(renderMathNode(kids[1] || null));
    return `${base}${subscript(sub)}`;
  }
  if (tag === 'msubsup') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const sub = cleanMathText(renderMathNode(kids[1] || null));
    const exp = cleanMathText(renderMathNode(kids[2] || null));
    return `${base}${subscript(sub)}${superscript(exp)}`;
  }
  if (tag === 'mfrac') {
    const num = cleanMathText(renderMathNode(kids[0] || null));
    const den = cleanMathText(renderMathNode(kids[1] || null));
    return `(${num})/(${den})`;
  }
  if (tag === 'msqrt') {
    const inner = cleanMathText(kids.map(renderMathNode).join(''));
    return `√(${inner})`;
  }
  if (tag === 'mover') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const over = cleanMathText(renderMathNode(kids[1] || null));
    if (over === '¯' || over === '—' || over === '-') return `${base}\u0304`;
    if (base === '~') return `~ ${over} `;
    return `${base}^{${over}}`;
  }
  if (tag === 'munder') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const under = cleanMathText(renderMathNode(kids[1] || null));
    if (/^[︸︷]+$/.test(under)) return base;
    return `${base}_{${under}}`;
  }
  if (tag === 'munderover') {
    const base = cleanMathText(renderMathNode(kids[0] || null));
    const under = cleanMathText(renderMathNode(kids[1] || null));
    const over = cleanMathText(renderMathNode(kids[2] || null));
    if (/^[︸︷]+$/.test(under)) return `${base} [= ${over}]`;
    return `${base}_{${under}}^{${over}}`;
  }
  if (tag === 'mtable') {
    const rows = Array.from(node.querySelectorAll(':scope > mtr'))
      .map((mtr) => {
        const cells = Array.from(mtr.querySelectorAll(':scope > mtd')).map((mtd) =>
          cleanMathText(renderMathNode(mtd))
        );
        return cells.join(' | ');
      })
      .filter(Boolean);
    return rows.join('; ');
  }
  if (tag === 'mtr') {
    return kids.map(renderMathNode).join(' | ');
  }
  if (tag === 'menclose' || tag === 'malignmark') {
    return kids.map(renderMathNode).join('');
  }

  return kids.map(renderMathNode).join('');
}

function buildChapterText(html, chapterTitle, chapterName) {
  const dom = new JSDOM(html, { contentType: 'application/xhtml+xml' });
  const doc = dom.window.document;
  const body = doc.body || doc.documentElement;

  const lines = [`# ${chapterTitle}`, ''];
  const stats = {
    equationsRendered: 0,
    equationsFallback: 0,
    figures: 0,
    codeBlocks: 0,
    tables: 0,
    warnings: [],
  };

  function renderMathElement(mathEl) {
    const rendered = cleanMathText(renderMathNode(mathEl));
    if (rendered) {
      stats.equationsRendered += 1;
      return rendered;
    }

    const alt = mathEl.getAttribute('altimg') || mathEl.getAttribute('alttext') || '';
    const base = alt ? path.basename(alt, path.extname(alt)) : `math-${stats.equationsFallback + 1}`;
    stats.equationsFallback += 1;
    const placeholder = `[EQN_IMAGE:${base}]`;
    stats.warnings.push(`${chapterName}: unresolved MathML rendered as ${placeholder}`);
    return placeholder;
  }

  function getHeadingText(headingEl) {
    const clone = headingEl.cloneNode(true);
    clone
      .querySelectorAll('span[epub\\:type="pagebreak"], span[role="doc-pagebreak"], span[id^="page_"]')
      .forEach((el) => el.remove());
    return normalizeInlineText(clone.textContent || '');
  }

  function getFigureLabel(imgEl) {
    if (!imgEl) return `figure-${stats.figures + 1}`;
    const src = imgEl.getAttribute('src') || '';
    if (src) return path.basename(src, path.extname(src));
    const parentFigure = imgEl.closest('figure');
    const figureId = parentFigure ? parentFigure.getAttribute('id') : '';
    if (figureId) return figureId;
    return `figure-${stats.figures + 1}`;
  }

  function getInlineText(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';

    const el = node;
    const tag = el.tagName.toLowerCase();

    if (tag === 'span' && el.getAttribute('epub:type') === 'pagebreak') return '';
    if (tag === 'br') return '\n';
    if (tag === 'math') return renderMathElement(el);
    if (tag === 'code') return `\`${collapseWhitespace(el.textContent || '')}\``;
    if (tag === 'sup') return superscript(collapseWhitespace(el.textContent || ''));
    if (tag === 'sub') return subscript(collapseWhitespace(el.textContent || ''));
    if (tag === 'img') return '';

    return Array.from(el.childNodes).map(getInlineText).join('');
  }

  function pushParagraph(text) {
    const cleaned = normalizeInlineText(text);
    if (!cleaned) return;
    lines.push(cleaned);
    lines.push('');
  }

  function processList(listEl, ordered) {
    const items = Array.from(listEl.querySelectorAll(':scope > li'));
    items.forEach((li, idx) => {
      const raw = normalizeInlineText(getInlineText(li));
      if (!raw) return;
      lines.push(ordered ? `${idx + 1}. ${raw}` : `- ${raw}`);
    });
    if (items.length) lines.push('');
  }

  function processTable(tableEl) {
    stats.tables += 1;
    const rows = Array.from(tableEl.querySelectorAll(':scope > tbody > tr, :scope > tr'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
        normalizeInlineText(getInlineText(cell))
      );
      if (cells.some(Boolean)) {
        lines.push(`| ${cells.join(' | ')} |`);
      }
    }
    lines.push('');
  }

  function processNode(node) {
    if (!node || node.nodeType !== 1) return;

    const el = node;
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute('class') || '').trim();

    if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
    if (tag === 'span' && el.getAttribute('epub:type') === 'pagebreak') return;

    if (tag === 'header' || tag === 'article' || tag === 'section' || tag === 'div') {
      if (tag === 'div' && cls === 'pre') {
        const codeLines = Array.from(el.querySelectorAll(':scope > p'))
          .map((p) => normalizeInlineText(getInlineText(p)))
          .filter(Boolean);
        const codeText = codeLines.join('\n');
        if (codeText) {
          stats.codeBlocks += 1;
          lines.push('```r');
          lines.push(codeText);
          lines.push('```');
          lines.push('');
        }
        return;
      }

      if (tag === 'div' && cls === 'image') {
        const img = el.querySelector('img');
        if (img) {
          const fig = getFigureLabel(img);
          stats.figures += 1;
          lines.push(`[FIGURE:${fig}]`);
          lines.push('');
        }
        return;
      }

      for (const child of Array.from(el.childNodes)) {
        processNode(child);
      }
      return;
    }

    if (tag === 'h1') return;
    if (tag === 'h2') {
      const heading = getHeadingText(el);
      if (heading) {
        lines.push(`## ${heading}`);
        lines.push('');
      }
      return;
    }
    if (tag === 'h3') {
      const heading = getHeadingText(el);
      if (heading) {
        lines.push(`### ${heading}`);
        lines.push('');
      }
      return;
    }

    if (tag === 'figure') {
      for (const child of Array.from(el.childNodes)) {
        processNode(child);
      }
      return;
    }
    if (tag === 'figcaption') {
      const caption = normalizeInlineText(getInlineText(el));
      if (caption) {
        lines.push(`[${caption}]`);
        lines.push('');
      }
      return;
    }

    if (tag === 'blockquote') {
      const quoteLines = Array.from(el.querySelectorAll(':scope > p'))
        .map((p) => normalizeInlineText(getInlineText(p)))
        .filter(Boolean);
      quoteLines.forEach((q) => lines.push(`> ${q}`));
      if (quoteLines.length) lines.push('');
      return;
    }

    if (tag === 'ul') {
      processList(el, false);
      return;
    }
    if (tag === 'ol') {
      processList(el, true);
      return;
    }
    if (tag === 'table') {
      processTable(el);
      return;
    }

    if (tag === 'p') {
      if (cls === 'eqn') {
        const math = el.querySelector('math');
        if (math) {
          const eq = renderMathElement(math);
          lines.push(`    ${eq}`);
          lines.push('');
          return;
        }
      }

      if (cls === 'eqnr') {
        const sideNote = normalizeInlineText(getInlineText(el));
        if (sideNote) {
          lines.push(`    ${sideNote}`);
          lines.push('');
        }
        return;
      }

      if (cls === 'image') {
        const img = el.querySelector('img');
        if (img) {
          const fig = getFigureLabel(img);
          stats.figures += 1;
          lines.push(`[FIGURE:${fig}]`);
          lines.push('');
        }
        return;
      }

      const para = getInlineText(el);
      pushParagraph(para);
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      processNode(child);
    }
  }

  for (const child of Array.from(body.childNodes)) {
    processNode(child);
  }

  let text = lines.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  text = polishChapterText(text);
  return { text: `${text}\n`, stats };
}

function ensureOutputDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith('.txt')) {
      fs.unlinkSync(path.join(OUT_DIR, name));
    }
  }
  if (fs.existsSync(REPORT_PATH)) {
    fs.unlinkSync(REPORT_PATH);
  }
  fs.rmSync(OUT_IMAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_IMAGE_DIR, { recursive: true });
}

function collectFigureIds(text) {
  return [...new Set([...text.matchAll(/\[FIGURE:([^\]]+)\]/g)].map((m) => m[1]))];
}

function copyFigureImages(figureIds, report) {
  const zip = new AdmZip(EPUB_PATH);
  const entryLookup = new Map();
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) {
      entryLookup.set(entry.entryName.toLowerCase(), entry);
    }
  }

  let copied = 0;
  let missing = 0;
  for (const figureId of figureIds) {
    const dest = path.join(OUT_IMAGE_DIR, `${figureId}.jpg`);
    const entry = entryLookup.get(`ops/images/${figureId}.jpg`.toLowerCase());
    if (!entry) {
      missing += 1;
      report.warnings.push(`Missing figure asset for ${figureId}: expected OPS/images/${figureId}.jpg`);
      continue;
    }
    fs.writeFileSync(dest, entry.getData());
    copied += 1;
  }

  report.totals.figure_images_copied = copied;
  report.totals.figure_images_missing = missing;
}

function extract() {
  if (!fs.existsSync(EPUB_PATH)) {
    console.error(`Missing source EPUB: ${EPUB_PATH}`);
    process.exit(1);
  }

  ensureOutputDir();

  const epub = new EPub(EPUB_PATH);
  epub.on('error', (err) => {
    console.error('EPUB parse error:', err);
    process.exit(1);
  });

  epub.on('end', () => {
    const tocFlat = flattenToc(epub.toc || []);
    const chapters = (epub.flow || [])
      .filter((item) => /^Chapter\d+$/.test(item.id))
      .map((item, idx) => {
        const fallbackNum = idx + 1;
        const tocTitle = findChapterTitle(tocFlat, item.href) || `Chapter ${fallbackNum}. ${item.title || ''}`.trim();
        const chapterNumber = extractChapterNumber(tocTitle, fallbackNum);
        return {
          id: item.id,
          href: item.href,
          chapterNumber,
          title: tocTitle,
          name: chapterOutputName(chapterNumber, tocTitle),
        };
      });

    if (chapters.length === 0) {
      console.error('No chapter flows found (expected Chapter01..Chapter17).');
      process.exit(1);
    }

    let done = 0;
    const allFigureIds = new Set();
    const report = {
      source_epub: EPUB_PATH,
      generated_at: new Date().toISOString(),
      output_dir: OUT_DIR,
      output_images_dir: OUT_IMAGE_DIR,
      chapter_count: chapters.length,
      chapters: [],
      totals: {
        equations_rendered: 0,
        equations_fallback: 0,
        figures: 0,
        code_blocks: 0,
        tables: 0,
        figure_images_copied: 0,
        figure_images_missing: 0,
      },
      warnings: [],
    };

    chapters.forEach((chapter) => {
      const loader = typeof epub.getChapterRaw === 'function' ? epub.getChapterRaw.bind(epub) : epub.getChapter.bind(epub);
      loader(chapter.id, (err, html) => {
        if (err) {
          console.error(`Failed to extract ${chapter.id}:`, err);
          done += 1;
          if (done === chapters.length) finalize();
          return;
        }

        const htmlText = Buffer.isBuffer(html) ? html.toString('utf8') : String(html);
        const { text, stats } = buildChapterText(htmlText, chapter.title, chapter.name);
        const outPath = path.join(OUT_DIR, `${chapter.name}.txt`);
        fs.writeFileSync(outPath, text, 'utf8');
        collectFigureIds(text).forEach((id) => allFigureIds.add(id));

        const words = text.split(/\s+/).filter(Boolean).length;
        console.log(
          `${chapter.name}: words=${words}, eq=${stats.equationsRendered}, eq_fallback=${stats.equationsFallback}, fig=${stats.figures}, code=${stats.codeBlocks}, table=${stats.tables}`
        );

        report.chapters.push({
          id: chapter.id,
          href: chapter.href,
          title: chapter.title,
          file: outPath,
          words,
          equations_rendered: stats.equationsRendered,
          equations_fallback: stats.equationsFallback,
          figures: stats.figures,
          code_blocks: stats.codeBlocks,
          tables: stats.tables,
        });
        report.totals.equations_rendered += stats.equationsRendered;
        report.totals.equations_fallback += stats.equationsFallback;
        report.totals.figures += stats.figures;
        report.totals.code_blocks += stats.codeBlocks;
        report.totals.tables += stats.tables;
        report.warnings.push(...stats.warnings);

        done += 1;
        if (done === chapters.length) finalize();
      });
    });

    function finalize() {
      copyFigureImages([...allFigureIds].sort(), report);
      report.chapters.sort((a, b) => a.file.localeCompare(b.file));
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`\nDone. Extracted ${report.chapters.length} chapters to ${OUT_DIR}`);
      console.log(`Report: ${REPORT_PATH}`);
    }
  });

  epub.parse();
}

extract();
