export function getTodayUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchDailyArticle(): Promise<{ title: string; content: string; url: string }> {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');

  // Step 1: Get today's featured article metadata
  const featuredRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`
  );
  if (!featuredRes.ok) {
    throw new Error(`Failed to fetch featured article list (${featuredRes.status})`);
  }
  const featured = await featuredRes.json();
  const tfa = featured.tfa;
  if (!tfa) {
    throw new Error('No featured article for today');
  }

  const title: string = tfa.titles?.canonical ?? tfa.title;
  const pageUrl: string = tfa.content_urls?.desktop?.page
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

  // Step 2: Fetch full plain text via Action API (CORS-friendly with origin=*)
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'extracts',
    explaintext: 'true',
    format: 'json',
    origin: '*',
  });
  const textRes = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!textRes.ok) {
    throw new Error(`Failed to fetch article text (${textRes.status})`);
  }
  const textData = await textRes.json();
  const pages = textData.query?.pages;
  if (!pages) {
    throw new Error('Unexpected API response format');
  }

  const pageId = Object.keys(pages)[0];
  const content: string = pages[pageId]?.extract;
  if (!content) {
    throw new Error('No text content found for featured article');
  }

  return { title, content, url: pageUrl };
}
