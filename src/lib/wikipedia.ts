export function getTodayUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const WIKI_HEADING_PATTERN = /^(={2,6})\s*(.+?)\s*\1$/;
const WIKI_TRAILING_SECTION_PATTERN = /^(see also|notes|references|citations|bibliography|further reading|external links)$/i;

function normalizeWikipediaParagraph(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    // Typical citation/note artifacts in extracted Wikipedia text
    .replace(/\[\d+\]/g, '')
    .replace(/\[(?:note|nb|lower-alpha)\s*\d+\]/gi, '')
    .replace(/\[(?:citation needed|clarification needed|who\?|when\?|according to whom\?)\]/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeWikipediaHeading(block: string): { level: number; text: string } | null {
  const headingMatch = block.match(WIKI_HEADING_PATTERN);
  if (!headingMatch) return null;

  const rawLevel = headingMatch[1].length;
  const level = Math.max(2, Math.min(6, rawLevel));
  const text = normalizeWikipediaParagraph(headingMatch[2]);
  if (!text) return null;

  return { level, text };
}

function sanitizeFigureCaption(caption: string): string {
  return caption.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/\]/g, ')').trim();
}

export function normalizeWikipediaContentForReader(extract: string): string {
  if (!extract || !extract.trim()) return '';

  const blocks = extract
    .replace(/\r/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const renderedBlocks: string[] = [];
  for (const block of blocks) {
    const heading = normalizeWikipediaHeading(block);
    if (heading) {
      if (WIKI_TRAILING_SECTION_PATTERN.test(heading.text)) {
        break;
      }
      renderedBlocks.push(`${'#'.repeat(heading.level)} ${heading.text}`);
      continue;
    }

    const normalized = normalizeWikipediaParagraph(block.replace(/\n+/g, ' '));
    if (!normalized) continue;
    renderedBlocks.push(normalized);
  }

  return renderedBlocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function prependWikipediaLeadFigure(
  content: string,
  leadImageUrl?: string,
  leadImageCaption?: string
): string {
  if (!content) return content;
  if (!leadImageUrl || !/^https?:\/\//i.test(leadImageUrl)) return content;

  if (/^\s*\[(?:FIGURE:|FIGURE_URL:)/i.test(content)) {
    return content;
  }

  const caption = sanitizeFigureCaption(leadImageCaption || 'Lead image');
  return `[FIGURE_URL:${leadImageUrl}]\n\n[FIGURE ${caption}]\n\n${content}`;
}

function buildLeadFigureCaption(title: string, description?: string): string {
  if (description && description.trim().length > 0) {
    return `${title} — ${description.trim()}`;
  }
  return title;
}

export function isWikipediaSource(source: string): boolean {
  return source === 'Wikipedia Daily' || source === 'Wikipedia Featured';
}

interface WikipediaArticlePayload {
  title: string;
  content: string;
  url: string;
}

async function fetchFeaturedForDate(yyyy: number, mm: string, dd: string): Promise<WikipediaArticlePayload> {
  // Step 1: Get featured article metadata for the given date
  const featuredRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`
  );
  if (!featuredRes.ok) {
    throw new Error(`Failed to fetch featured article list (${featuredRes.status})`);
  }
  const featured = await featuredRes.json();
  const tfa = featured.tfa;
  if (!tfa) {
    throw new Error('No featured article for this date');
  }

  const rawTitle: string = tfa.titles?.canonical ?? tfa.title;
  const title: string = (tfa.titles?.normalized ?? rawTitle).replace(/_/g, ' ');
  const pageUrl: string = tfa.content_urls?.desktop?.page
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(rawTitle)}`;
  const tfaLeadImageUrl: string | undefined = tfa.originalimage?.source ?? tfa.thumbnail?.source;
  const tfaDescription: string | undefined = tfa.description;

  // Step 2: Fetch full plain text + lead image metadata via Action API
  const params = new URLSearchParams({
    action: 'query',
    titles: rawTitle,
    prop: 'extracts|pageimages',
    explaintext: 'true',
    exsectionformat: 'wiki',
    piprop: 'original',
    redirects: '1',
    formatversion: '2',
    format: 'json',
    origin: '*',
  });
  const textRes = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!textRes.ok) {
    throw new Error(`Failed to fetch article text (${textRes.status})`);
  }
  const textData = await textRes.json();
  const page = textData.query?.pages?.[0];
  if (!page) {
    throw new Error('Unexpected API response format');
  }
  const rawExtract: string = page.extract;
  if (!rawExtract) {
    throw new Error('No text content found for featured article');
  }
  const normalizedContent = normalizeWikipediaContentForReader(rawExtract);
  if (!normalizedContent) {
    throw new Error('Featured article text was empty after cleanup');
  }

  const leadImageUrl = tfaLeadImageUrl ?? page.original?.source;
  const leadCaption = buildLeadFigureCaption(title, tfaDescription);
  const content = prependWikipediaLeadFigure(normalizedContent, leadImageUrl, leadCaption);

  return { title, content, url: pageUrl };
}

export async function fetchDailyArticle(): Promise<WikipediaArticlePayload> {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return fetchFeaturedForDate(yyyy, mm, dd);
}

export async function fetchRandomFeaturedArticle(): Promise<WikipediaArticlePayload> {
  // Pick a random date from the last ~5 years of Wikipedia featured articles
  const start = new Date('2021-01-01').getTime();
  const end = Date.now() - 86_400_000; // yesterday

  let lastError: unknown = null;
  // Random days occasionally fail because not all days have a TFA payload.
  for (let attempt = 0; attempt < 8; attempt++) {
    const d = new Date(start + Math.random() * (end - start));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    try {
      return await fetchFeaturedForDate(yyyy, mm, dd);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Unable to fetch a random featured article');
}
