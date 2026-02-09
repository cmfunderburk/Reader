export function getTodayUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchFeaturedForDate(yyyy: number, mm: string, dd: string): Promise<{ title: string; content: string; url: string }> {
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

export async function fetchDailyArticle(): Promise<{ title: string; content: string; url: string }> {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return fetchFeaturedForDate(yyyy, mm, dd);
}

export async function fetchRandomFeaturedArticle(): Promise<{ title: string; content: string; url: string }> {
  // Pick a random date from the last ~5 years of Wikipedia featured articles
  const start = new Date('2021-01-01').getTime();
  const end = Date.now() - 86_400_000; // yesterday
  const d = new Date(start + Math.random() * (end - start));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return fetchFeaturedForDate(yyyy, mm, dd);
}
