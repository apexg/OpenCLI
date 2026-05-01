import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { ArgumentError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'comment',
    description: '对视频发表评论',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'text', required: true, help: '评论内容' },
        { name: 'reply_id', default: '', help: '回复的评论 cid（留空为顶级评论）' },
    ],
    columns: ['cid', 'text', 'aweme_id', 'create_time', 'digg_count'],
    func: async (page, kwargs) => {
        if (!kwargs.text.trim()) {
            throw new ArgumentError('评论内容不能为空');
        }
        const params = new URLSearchParams({
            aweme_id: kwargs.aweme_id,
            text: kwargs.text,
            aid: '6383',
        });
        if (kwargs.reply_id) {
            params.set('reply_id', kwargs.reply_id);
        }
        const js = `
      (async () => {
        const res = await fetch('https://www.douyin.com/aweme/v1/web/comment/publish/?aid=6383', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            referer: 'https://www.douyin.com/'
          },
          body: ${JSON.stringify(params.toString())}
        });
        return res.json();
      })()
    `;
        const res = await page.evaluate(js);
        if (!res.comment) {
            throw new Error(`评论失败: ${JSON.stringify(res)}`);
        }
        const c = res.comment;
        return [{
                cid: c.cid,
                text: c.text,
                aweme_id: c.aweme_id,
                create_time: new Date(c.create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                digg_count: c.digg_count ?? 0,
            }];
    },
});
