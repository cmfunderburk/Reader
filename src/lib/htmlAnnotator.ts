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
 * Resolve an image src against a resource map.
 * Tries: exact match, stripped leading ../ segments, and basename-only fallback.
 */
export function resolveResourceUrl(src: string, resources: Map<string, string>): string | undefined {
  // 1. Exact match
  if (resources.has(src)) return resources.get(src);

  // 2. Strip leading ../ segments
  const stripped = src.replace(/^(\.\.\/)+/, '');
  if (stripped !== src && resources.has(stripped)) return resources.get(stripped);

  // 3. Basename-only fallback
  const basename = src.split('/').pop();
  if (basename) {
    for (const [key, url] of resources) {
      if (key.split('/').pop() === basename) return url;
    }
  }

  return undefined;
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
      if (src) {
        const resolved = resolveResourceUrl(src, options.resources);
        if (resolved) {
          img.setAttribute('src', resolved);
        }
      }
    }
  }

  // Sanitize: remove <script> and <style> elements
  for (const tag of ['script', 'style'] as const) {
    const els = doc.body.querySelectorAll(tag);
    for (const el of els) el.remove();
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

  // Sanitize: strip inline event handlers and javascript: URLs
  const allElements = doc.body.querySelectorAll('*');
  for (const el of allElements) {
    const attrsToRemove: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('on')) {
        attrsToRemove.push(attr.name);
      }
      if (
        (attr.name === 'href' || attr.name === 'src') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        attrsToRemove.push(attr.name);
      }
    }
    for (const name of attrsToRemove) {
      el.removeAttribute(name);
    }
  }

  const annotatedHtml = doc.body.innerHTML;
  return { html: annotatedHtml, wordCount: wordIndex, words };
}
