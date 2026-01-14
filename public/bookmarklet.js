/**
 * SpeedRead Bookmarklet
 *
 * This bookmarklet extracts article content from the current page
 * and stores it in localStorage for SpeedRead to pick up.
 *
 * To use:
 * 1. Create a new bookmark
 * 2. Set the URL to the minified version below
 * 3. Navigate to an article (logged in if paywalled)
 * 4. Click the bookmarklet
 * 5. Return to SpeedRead and click "Load from Bookmarklet"
 *
 * Minified version (copy this as bookmark URL):
 * javascript:(function(){const t=document.querySelector('h1')?.innerText||document.title;const a=document.querySelector('article')||document.querySelector('main')||document.body;const c=a.innerText;const s=location.hostname.replace('www.','');const d={title:t,content:c,source:s,url:location.href};localStorage.setItem('speedread_bookmarklet',JSON.stringify(d));alert('Article saved! Return to SpeedRead and click "Load from Bookmarklet"');})();
 */

(function() {
  // Extract title - try h1 first, fall back to document title
  const title = document.querySelector('h1')?.innerText || document.title;

  // Extract content - try common article containers
  const articleElement =
    document.querySelector('article') ||
    document.querySelector('[role="article"]') ||
    document.querySelector('.article-content') ||
    document.querySelector('.post-content') ||
    document.querySelector('main') ||
    document.body;

  const content = articleElement.innerText;

  // Extract source from hostname
  const source = location.hostname.replace('www.', '');

  // Create data object
  const data = {
    title: title,
    content: content,
    source: source,
    url: location.href
  };

  // Store in localStorage
  localStorage.setItem('speedread_bookmarklet', JSON.stringify(data));

  // Notify user
  alert('Article saved! Return to SpeedRead and click "Load from Bookmarklet"');
})();
