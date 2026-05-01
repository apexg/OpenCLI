import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'instagram',
  name: 'hashtag',
  description: 'Search posts by hashtag',
  domain: 'www.instagram.com',
  strategy: Strategy.UI,
  args: [
    { name: 'tag', required: true, positional: true, help: 'Hashtag name (without #)' },
    { name: 'limit', type: 'int', default: 20, help: 'Number of posts' },
  ],
  columns: ['rank', 'shortcode', 'user', 'caption', 'likes', 'comments', 'type', 'url'],
  func: async (page, kwargs) => {
    const tag = kwargs.tag || 'ai';
    const limit = Math.min(Number(kwargs.limit) || 20, 50);

    // Navigate to hashtag page
    await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`);
    await page.wait({ time: 2 });

    // Scroll to load more posts
    for (let i = 0; i < Math.ceil(limit / 12); i++) {
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await page.wait({ time: 1 });
    }

    // Extract posts from the page
    const posts = await page.evaluate(`
      (() => {
        const results = [];
        const seen = new Set();

        // Find all post links
        document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
          const href = a.href;
          if (seen.has(href)) return;
          seen.add(href);

          // Extract shortcode from URL
          const match = href.match(/\\/p\\/([^\\/]+)\\//) || href.match(/\\/reel\\/([^\\/]+)\\//);
          if (!match) return;
          const shortcode = match[1];

          // Get image alt text as caption hint
          const img = a.querySelector('img');
          const alt = (img?.alt || '').substring(0, 100);

          // Get like count from aria-label or nearby elements
          const aria = img?.getAttribute('aria-label') || '';
          const likeMatch = aria.match(/liked by ([\\d,]+) people/i);
          const likes = likeMatch ? parseInt(likeMatch[1].replace(/,/g, ''), 10) : 0;

          // Determine type from URL
          const type = href.includes('/reel/') ? 'video' : 'photo';

          results.push({
            shortcode,
            user: '',  // User name not available from grid view
            caption: alt,
            likes,
            comments: 0,
            type,
            url: href,
          });
        });

        return results;
      })()
    `);

    return (Array.isArray(posts) ? posts : []).slice(0, limit).map((p, i) => ({
      rank: i + 1,
      ...p,
    }));
  },
});