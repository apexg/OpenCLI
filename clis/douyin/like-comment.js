import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { CommandExecutionError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'like-comment',
    description: '对评论点赞或取消点赞',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'cid', required: true, help: '评论 cid' },
        { name: 'undo', type: 'bool', default: false, help: '取消点赞' },
    ],
    columns: ['aweme_id', 'cid', 'action', 'status'],
    func: async (page, kwargs) => {
        const body = new URLSearchParams({
            aweme_id: kwargs.aweme_id,
            cid: kwargs.cid,
            digg_type: kwargs.undo ? '0' : '1',
            aid: '6383',
        }).toString();
        const url = 'https://www.douyin.com/aweme/v1/web/comment/digg/?aid=6383';
        const res = await browserFetch(page, 'POST', url, { formBody: body });
        return [{
                aweme_id: kwargs.aweme_id,
                cid: kwargs.cid,
                action: kwargs.undo ? 'cancel' : 'like',
                status: 'ok',
            }];
    },
});
