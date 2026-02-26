import ePub from 'epubjs';
import type Section from 'epubjs/types/section';

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
 * Load and parse an EPUB file from an ArrayBuffer.
 * Extracts chapter HTML, TOC titles, and resource blob URLs.
 */
export async function loadEpubFromBuffer(buffer: ArrayBuffer): Promise<EpubBookData> {
  const book = ePub(buffer);
  await book.ready;

  const title = book.packaging?.metadata?.title || 'Untitled';
  const toc = await book.loaded.navigation;

  // Build TOC title lookup: href -> title
  const tocTitles = new Map<string, string>();
  for (const item of toc.toc) {
    const href = item.href.split('#')[0]; // strip fragment
    tocTitles.set(href, item.label.trim());
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
  const spine = book.spine as unknown as { items?: Section[] } & Iterable<Section>;
  const sections: Section[] = spine.items ?? Array.from(spine);

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

  return { title, chapters, resources };
}

/**
 * Extract plain text from chapter HTML (for feeding to existing reading modes).
 */
export function extractPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body?.textContent?.trim() || '';
}
