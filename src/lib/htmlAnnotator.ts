export interface AnnotationResult {
  /** Annotated HTML with word spans added */
  html: string;
  /** Total number of words found */
  wordCount: number;
  /** Ordered list of word text content, indexed by data-word-idx */
  words: string[];
}

export interface AnnotationOptions {
  /** Map of original resource href to blob URL — used to rewrite <img> src attributes */
  resources?: Map<string, string>;
}

/**
 * Walk all text nodes in the HTML, split into words, and wrap each word
 * in a <span data-word-idx="N"> element. Preserves all HTML structure,
 * images, and non-text content.
 *
 * Word indices are continuous across the entire document, enabling
 * downstream consumers (pacer, generation masking) to target words
 * by index regardless of their position in the HTML tree.
 *
 * When `options.resources` is provided, rewrites <img> src attributes
 * whose original value matches a key in the map to the corresponding
 * blob URL. This enables EPUB images to display correctly.
 */
export function annotateHtmlWords(html: string, options?: AnnotationOptions): AnnotationResult {
  if (!html.trim()) {
    return { html: '', wordCount: 0, words: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Rewrite resource URLs (e.g. EPUB images)
  if (options?.resources) {
    const images = doc.body.querySelectorAll('img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && options.resources.has(src)) {
        img.setAttribute('src', options.resources.get(src)!);
      }
    }
  }
  const words: string[] = [];
  let wordIndex = 0;

  // Collect all text nodes first (modifying DOM during walk is unsafe)
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    // Skip text inside <script>, <style> tags
    const parent = textNode.parentElement;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;

    const fragment = doc.createDocumentFragment();
    // Split on word boundaries, preserving whitespace segments
    const parts = text.split(/(\s+)/);

    for (const part of parts) {
      if (/^\s+$/.test(part) || part === '') {
        // Whitespace -- preserve as-is
        fragment.appendChild(doc.createTextNode(part));
      } else {
        // Word -- wrap in span with data-word-idx
        const span = doc.createElement('span');
        span.setAttribute('data-word-idx', String(wordIndex));
        span.textContent = part;
        fragment.appendChild(span);
        words.push(part);
        wordIndex++;
      }
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  const annotatedHtml = doc.body.innerHTML;
  return { html: annotatedHtml, wordCount: wordIndex, words };
}
