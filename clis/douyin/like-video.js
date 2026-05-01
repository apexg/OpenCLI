import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'like-video',
    description: '对视频点赞',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'undo', type: 'bool', default: false, help: '取消点赞' },
    ],
    columns: ['aweme_id', 'action', 'is_digg'],
    func: async (page, kwargs) => {
        const diggType = kwargs.undo ? '0' : '1';
        const path = kwargs.undo
            ? '/aweme/v1/web/cancel/item/digg/multi/?aid=6383'
            : '/aweme/v1/web/commit/item/digg/?aid=6383';
        const body = kwargs.undo
            ? new URLSearchParams({ aweme_id: kwargs.aweme_id, aid: '6383' }).toString()
            : new URLSearchParams({ aweme_id: kwargs.aweme_id, type: diggType, aid: '6383' }).toString();
        const js = `
      (async () => {
        const res = await fetch('https://www.douyin.com${path}', {
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
            throw new Error(`点赞操作失败: ${res.status_msg ?? JSON.stringify(res)}`);
        }
        return [{
                aweme_id: kwargs.aweme_id,
                action: kwargs.undo ? 'cancel' : 'like',
                is_digg: res.is_digg ?? (kwargs.undo ? 0 : 1),
            }];
    },
});
