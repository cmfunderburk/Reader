import ePub from 'epubjs';
import type Section from 'epubjs/types/section';
import { splitChapterOnHeadings } from './epubChapterSplit';

export interface EpubChapter {
  id: string;
  title: string;
  html: string;
  href: string;
}

export interface EpubBookData {
  title: string;
  chapters: EpubChapter[];
  resources: Map<string, string>; // original href -> blob URL
}

/**
 * Recursively flatten a TOC tree into an ordered list of { href, label } entries.
 * Handles nested sub-items (e.g. sub-chapters) that epubjs exposes via `subitems`.
 */
interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

export function flattenToc(items: TocItem[]): Array<{ href: string; label: string }> {
  const result: Array<{ href: string; label: string }> = [];
  for (const item of items) {
    result.push({ href: item.href, label: item.label });
    if (item.subitems?.length) {
      result.push(...flattenToc(item.subitems));
    }
  }
  return result;
}

/**
 * Load and parse an EPUB file from an ArrayBuffer.
 * Extracts chapter HTML, TOC titles, and resource blob URLs.
 */
export async function loadEpubFromBuffer(buffer: ArrayBuffer): Promise<EpubBookData> {
  const book = ePub(buffer);
  await book.ready;

  const title = book.packaging?.metadata?.title || 'Untitled';
  const toc = await book.loaded.navigation;

  // Build TOC title lookup: href -> title (recursively flattening nested items)
  const tocTitles = new Map<string, string>();
  for (const item of flattenToc(toc.toc)) {
    const href = item.href.split('#')[0]; // strip fragment
    if (!tocTitles.has(href)) {
      tocTitles.set(href, item.label.trim());
    }
  }

  // Extract resources (images, fonts) as blob URLs
  const resources = new Map<string, string>();
  const manifest = book.packaging?.manifest;
  if (manifest) {
    for (const key of Object.keys(manifest)) {
      const entry = manifest[key];
      if (entry.type?.startsWith('image/') || entry.type?.startsWith('font/')) {
        try {
          const url = await book.archive.createUrl(entry.href, { base64: false });
          resources.set(entry.href, url);
        } catch {
          // Skip resources that fail to load
        }
      }
    }
  }

  // Extract chapters from spine (reading order)
  const chapters: EpubChapter[] = [];
  // epub.js Spine stores Section instances in `spineItems`, not `items`
  // (`items` holds raw packaging data without load() method)
  const spine = book.spine as unknown as { spineItems?: Section[] };
  const sections: Section[] = spine.spineItems ?? [];

  for (const section of sections) {
    try {
      const doc = await section.load(book.load.bind(book));
      const serializer = new XMLSerializer();
      const html = serializer.serializeToString(doc);

      const href = section.href.split('#')[0];
      const sectionTitle = tocTitles.get(href) || `Section ${chapters.length + 1}`;

      chapters.push({
        id: section.idref || `section-${chapters.length}`,
        title: sectionTitle,
        html,
        href,
      });
    } catch {
      // Skip sections that fail to parse
    }
  }

  // Split monolithic chapters that contain multiple headings
  const splitChapters: EpubChapter[] = [];
  for (const chapter of chapters) {
    splitChapters.push(...splitChapterOnHeadings(chapter));
  }

  return { title, chapters: splitChapters, resources };
}

/**
 * Extract plain text from chapter HTML (for feeding to existing reading modes).
 */
export function extractPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body?.textContent?.trim() || '';
}
