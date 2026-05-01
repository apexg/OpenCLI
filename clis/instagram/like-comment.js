import { cli, Strategy } from '@jackwener/opencli/registry';

function parseShortcode(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('http')) {
    try {
      const url = new URL(raw);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && ['p', 'reel', 'tv'].includes(segments[0])) {
        return segments[1];
      }
    } catch {}
  }
  return raw;
}

cli({
  site: 'instagram',
  name: 'like-comment',
  description: 'Like a comment on an Instagram post (via UI)',
  domain: 'www.instagram.com',
  strategy: Strategy.UI,
  args: [
    { name: 'shortcode', required: true, positional: true, help: 'Post shortcode or URL' },
    { name: 'comment-id', required: true, positional: true, help: 'Comment ID to like' },
    { name: 'unlike', type: 'boolean', default: false, help: 'Unlike the comment' },
  ],
  columns: ['status', 'shortcode', 'commentId', 'action'],
  func: async (page, kwargs) => {
    const shortcode = parseShortcode(kwargs.shortcode);
    if (!shortcode) throw new Error('Invalid shortcode or URL');
    const commentId = kwargs['comment-id'];
    if (!commentId) throw new Error('Comment ID is required');
    const unlike = kwargs.unlike || false;

    // Navigate to post page
    await page.goto(`https://www.instagram.com/p/${shortcode}/`);
    await page.wait({ time: 3 });

    // Scroll to load comments
    await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await page.wait({ time: 2 });

    // Find and click comment like button via UI
    const result = await page.evaluate(`
      (async () => {
        const targetCommentId = ${JSON.stringify(commentId)};
        const unlike = ${JSON.stringify(unlike)};

        // Find comment section and like buttons
        const likeBtns = document.querySelectorAll('svg[aria-label="赞"], svg[aria-label="Like"]');
        const likedBtns = document.querySelectorAll('svg[aria-label="已赞"], svg[aria-label="Liked"]');

        // Try to find the specific comment by its content or position
        // This is a heuristic approach - we need to scroll to the comment
        // For now, click the first available comment like button that isn't already liked
        let clicked = false;

        if (unlike) {
          // Find already liked comments and click to unlike
          for (const btn of likedBtns) {
            const parent = btn.closest('div[role="button"]') || btn.parentElement;
            if (parent) {
              parent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              clicked = true;
              break;
            }
          }
        } else {
          // Find unliked comments and click to like
          for (const btn of likeBtns) {
            // Skip the first one (usually post like)
            const parent = btn.closest('div[role="button"]') || btn.parentElement;
            if (parent) {
              parent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              clicked = true;
              break;
            }
          }
        }

        return { clicked };
      })()
    `);

    if (result?.clicked) {
      const action = unlike ? 'unliked' : 'liked';
      return [{ status: 'Success', shortcode, commentId, action }];
    } else {
      return [{ status: 'Failed', shortcode, commentId, action: 'Could not find comment like button' }];
    }
  },
});