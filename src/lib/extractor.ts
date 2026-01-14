/**
 * Article content extraction utilities.
 *
 * Note: For better extraction quality, consider using @mozilla/readability
 * which is included as a dependency but requires the article HTML.
 */

/**
 * Extract article content from HTML using simple heuristics.
 * Falls back to progressively less specific selectors.
 */
export function extractArticleFromHtml(html: string, url: string): {
  title: string;
  content: string;
  source: string;
} {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Extract title
  const title = extractTitle(doc);

  // Extract main content
  const content = extractContent(doc);

  // Extract source from URL
  const source = new URL(url).hostname.replace('www.', '');

  return { title, content, source };
}

function extractTitle(doc: Document): string {
  // Try common title patterns
  const selectors = [
    'article h1',
    'main h1',
    '.article-title',
    '.post-title',
    '.entry-title',
    'h1',
    'meta[property="og:title"]',
    'title',
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      if (selector.includes('meta')) {
        const content = el.getAttribute('content');
        if (content) return content.trim();
      } else if (el.textContent) {
        return el.textContent.trim();
      }
    }
  }

  return 'Untitled';
}

function extractContent(doc: Document): string {
  // Remove unwanted elements
  const unwantedSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'aside',
    '.sidebar',
    '.comments',
    '.advertisement',
    '.ad',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
  ];

  unwantedSelectors.forEach(selector => {
    doc.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Try common article containers
  const selectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.article-body',
    '.post-content',
    '.post-body',
    '.entry-content',
    '.story-content',
    'main',
    '.content',
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && el.textContent && el.textContent.length > 500) {
      return cleanText(el.textContent);
    }
  }

  // Fallback: get body text
  return cleanText(doc.body.textContent || '');
}

function cleanText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Remove common artifacts
    .replace(/Share on (Twitter|Facebook|LinkedIn)/gi, '')
    .replace(/Advertisement/gi, '')
    .replace(/Read more:/gi, '')
    .trim();
}

/**
 * Estimate word count from content.
 */
export function wordCount(content: string): number {
  return content.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate reading time in minutes at given WPM.
 */
export function estimateReadTime(content: string, wpm: number): number {
  return Math.ceil(wordCount(content) / wpm);
}
