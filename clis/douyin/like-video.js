import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { CommandExecutionError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'like-video',
    description: '对视频点赞或取消点赞',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'undo', type: 'bool', default: false, help: '取消点赞' },
    ],
    columns: ['aweme_id', 'action', 'is_digg'],
    func: async (page, kwargs) => {
        const path = kwargs.undo
            ? '/aweme/v1/web/cancel/item/digg/multi/?aid=6383'
            : '/aweme/v1/web/commit/item/digg/?aid=6383';
        const body = kwargs.undo
            ? new URLSearchParams({ aweme_id: kwargs.aweme_id, aid: '6383' }).toString()
            : new URLSearchParams({ aweme_id: kwargs.aweme_id, type: kwargs.undo ? '0' : '1', aid: '6383' }).toString();
        const url = `https://www.douyin.com${path}`;
        const res = await browserFetch(page, 'POST', url, { formBody: body });
        return [{
                aweme_id: kwargs.aweme_id,
                action: kwargs.undo ? 'cancel' : 'like',
                is_digg: res.is_digg ?? (kwargs.undo ? 0 : 1),
            }];
    },
});
