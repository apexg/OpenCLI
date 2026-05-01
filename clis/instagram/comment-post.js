import { cli, Strategy } from '@jackwener/opencli/registry';

const INSTAGRAM_APP_ID = '936619743392459';
const INSTAGRAM_GRAPHQL_DOC_ID = '8845758582119845';

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

function buildGqlUrl(shortcode) {
  const vars = JSON.stringify({
    shortcode,
    fetch_tagged_user_count: null,
    hoisted_comment_id: null,
    hoisted_reply_id: null,
  });
  return `https://www.instagram.com/graphql/query/?doc_id=${INSTAGRAM_GRAPHQL_DOC_ID}&variables=${encodeURIComponent(vars)}`;
}

cli({
  site: 'instagram',
  name: 'comment-post',
  description: 'Comment on an Instagram post by shortcode',
  domain: 'www.instagram.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'shortcode', required: true, positional: true, help: 'Post shortcode or URL' },
    { name: 'text', required: true, positional: true, help: 'Comment text' },
  ],
  columns: ['status', 'shortcode', 'text'],
  func: async (page, kwargs) => {
    const shortcode = parseShortcode(kwargs.shortcode);
    if (!shortcode) throw new Error('Invalid shortcode or URL');
    const commentText = String(kwargs.text || '').trim();
    if (!commentText) throw new Error('Comment text is required');

    // Navigate to post page
    await page.goto(`https://www.instagram.com/p/${shortcode}/`);
    await page.wait({ time: 2 });

    // Get media ID via GraphQL
    const gqlUrl = buildGqlUrl(shortcode);
    const gqlResult = await page.evaluate(`
      (async () => {
        const res = await fetch(${JSON.stringify(gqlUrl)}, { credentials: 'include', headers: { 'X-IG-App-ID': ${JSON.stringify(INSTAGRAM_APP_ID)} } });
        return await res.json();
      })()
    `);

    const mediaId = gqlResult?.data?.xdt_shortcode_media?.id;
    if (!mediaId) {
      return [{ status: 'Failed', shortcode, text: 'Post not found or private' }];
    }

    // Post comment
    const result = await page.evaluate(`
      (async () => {
        const mediaId = ${JSON.stringify(mediaId)};
        const commentText = ${JSON.stringify(commentText)};
        const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';

        const res = await fetch(
          'https://www.instagram.com/api/v1/web/comments/' + mediaId + '/add/',
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-IG-App-ID': ${JSON.stringify(INSTAGRAM_APP_ID)},
              'X-CSRFToken': csrf,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'comment_text=' + encodeURIComponent(commentText),
          }
        );

        const data = await res.json();
        return { ok: res.ok, status: data?.status, message: data?.message };
      })()
    `);

    if (result?.ok && result?.status === 'ok') {
      return [{ status: 'Commented', shortcode, text: commentText }];
    } else {
      return [{ status: 'Failed', shortcode, text: result?.message || 'Unknown error' }];
    }
  },
});