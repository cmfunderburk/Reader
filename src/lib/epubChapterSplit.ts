import type { EpubChapter } from './epubParser';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

/**
 * Split a single EPUB chapter into multiple virtual chapters at h1/h2/h3
 * heading boundaries. Useful for Gutenberg-style EPUBs that pack all content
 * into one spine item, producing a single massive chapter.
 *
 * Returns the original chapter unchanged if it contains fewer than 2 headings.
 */
export function splitChapterOnHeadings(chapter: EpubChapter): EpubChapter[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter.html, 'text/html');
  const body = doc.body;

  if (!body) return [chapter];

  // Walk top-level children and count headings to decide whether to split
  const children = Array.from(body.childNodes);
  let headingCount = 0;
  for (const node of children) {
    if (node.nodeType === Node.ELEMENT_NODE && HEADING_TAGS.has((node as Element).tagName)) {
      headingCount++;
    }
  }

  if (headingCount < 2) return [chapter];

  // Build sections: each section is { title, nodes }
  const sections: Array<{ title: string; nodes: Node[] }> = [];
  let currentNodes: Node[] = [];
  let currentTitle: string | null = null; // null = frontmatter

  for (const node of children) {
    const isHeading =
      node.nodeType === Node.ELEMENT_NODE && HEADING_TAGS.has((node as Element).tagName);

    if (isHeading) {
      // Flush previous section
      if (currentNodes.length > 0 || currentTitle !== null) {
        sections.push({ title: currentTitle ?? chapter.title, nodes: currentNodes });
      }
      currentTitle = (node as Element).textContent?.trim() || 'Untitled';
      currentNodes = [node];
    } else {
      currentNodes.push(node);
    }
  }

  // Flush final section
  if (currentNodes.length > 0 || currentTitle !== null) {
    sections.push({ title: currentTitle ?? chapter.title, nodes: currentNodes });
  }

  // Skip empty frontmatter (whitespace-only content before first heading)
  if (sections.length > 0 && sections[0].title === chapter.title) {
    const frontmatterText = sections[0].nodes
      .map(n => n.textContent ?? '')
      .join('')
      .trim();
    if (frontmatterText === '') {
      sections.shift();
    }
  }

  // If after processing we ended up with fewer than 2 sections, return original
  if (sections.length < 2) return [chapter];

  // Build the result chapters
  return sections.map((section, i) => {
    const wrapper = doc.createElement('div');
    for (const node of section.nodes) {
      wrapper.appendChild(node.cloneNode(true));
    }
    return {
      id: `${chapter.id}-split-${i}`,
      title: section.title,
      html: wrapper.innerHTML,
      href: chapter.href,
    };
  });
}
