import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'like-comment',
    description: '对评论点赞',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'cid', required: true, help: '评论 cid' },
        { name: 'undo', type: 'bool', default: false, help: '取消点赞' },
    ],
    columns: ['aweme_id', 'cid', 'action', 'status'],
    func: async (page, kwargs) => {
        const diggType = kwargs.undo ? '0' : '1';
        const body = new URLSearchParams({
            aweme_id: kwargs.aweme_id,
            cid: kwargs.cid,
            digg_type: diggType,
            aid: '6383',
        }).toString();
        const js = `
      (async () => {
        const res = await fetch('https://www.douyin.com/aweme/v1/web/comment/digg/?aid=6383', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            referer: 'https://www.douyin.com/'
          },
          body: ${JSON.stringify(body)}
        });
        return res.json();
      })()
    `;
        const res = await page.evaluate(js);
        if (res.status_code !== 0) {
            throw new Error(`评论点赞失败: ${res.status_msg ?? JSON.stringify(res)}`);
        }
        return [{
                aweme_id: kwargs.aweme_id,
                cid: kwargs.cid,
                action: kwargs.undo ? 'cancel' : 'like',
                status: 'ok',
            }];
    },
});
