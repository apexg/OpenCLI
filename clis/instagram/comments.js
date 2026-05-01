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

function buildCommentsUrl(mediaId) {
  return `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true`;
}

cli({
  site: 'instagram',
  name: 'comments',
  description: 'Get comments from an Instagram post',
  domain: 'www.instagram.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'shortcode', required: true, positional: true, help: 'Post shortcode or URL' },
    { name: 'limit', type: 'int', default: 20, help: 'Number of comments' },
  ],
  columns: ['index', 'id', 'user', 'text', 'likes', 'liked', 'time'],
  func: async (page, kwargs) => {
    const shortcode = parseShortcode(kwargs.shortcode);
    if (!shortcode) throw new Error('Invalid shortcode or URL');
    const limit = Math.min(Number(kwargs.limit) || 20, 100);

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
      throw new Error('Post not found: ' + shortcode);
    }

    // Get comments
    const commentsUrl = buildCommentsUrl(mediaId);
    const commentsResult = await page.evaluate(`
      (async () => {
        const res = await fetch(${JSON.stringify(commentsUrl)}, { credentials: 'include', headers: { 'X-IG-App-ID': ${JSON.stringify(INSTAGRAM_APP_ID)} } });
        return await res.json();
      })()
    `);

    const comments = (commentsResult?.comments || []).slice(0, limit).map((c, i) => ({
      index: i + 1,
      id: c.pk || '',
      user: c.user?.username || '',
      text: (c.text || '').replace(/\n/g, ' ').substring(0, 200),
      likes: c.comment_like_count ?? 0,
      liked: c.has_liked_comment ?? false,
      time: c.created_at ? new Date(c.created_at * 1000).toLocaleDateString() : '',
    }));

    return comments;
  },
});