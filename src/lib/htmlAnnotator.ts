import { maskGenerationLine } from './generationMask';
import type { GenerationDifficulty } from '../types';

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
 * Sanitize and rewrite resource URLs in EPUB HTML without wrapping words in spans.
 * Use this for browse mode where word-level annotation is not needed — it produces
 * a much lighter DOM that CSS multi-column layout can handle for large chapters.
 */
export function sanitizeEpubHtml(html: string, options?: AnnotationOptions): string {
  if (!html.trim()) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  if (options?.resources) {
    const images = doc.body.querySelectorAll('img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src) {
        const resolved = resolveResourceUrl(src, options.resources);
        if (resolved) img.setAttribute('src', resolved);
      }
    }
  }

  for (const tag of ['script', 'style'] as const) {
    const els = doc.body.querySelectorAll(tag);
    for (const el of els) el.remove();
  }

  const allElements = doc.body.querySelectorAll('*');
  for (const el of allElements) {
    const attrsToRemove: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('on')) attrsToRemove.push(attr.name);
      if (
        (attr.name === 'href' || attr.name === 'src') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        attrsToRemove.push(attr.name);
      }
    }
    for (const name of attrsToRemove) el.removeAttribute(name);
  }

  return doc.body.innerHTML;
}

/**
 * Apply generation masking directly to text nodes in sanitized HTML.
 * Walks all text nodes via TreeWalker, applies maskGenerationLine to each,
 * and returns the modified HTML string. No word spans needed.
 */
export function maskHtmlTextNodes(
  html: string,
  difficulty: GenerationDifficulty,
  seed: number,
): string {
  if (!html.trim()) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let nodeIndex = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || '';
    if (!text.trim()) continue;
    node.textContent = maskGenerationLine(text, difficulty, seed, nodeIndex);
    nodeIndex++;
  }

  return doc.body.innerHTML;
}
