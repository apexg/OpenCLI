import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'video-detail',
    description: '获取视频详情（标题、描述、统计数据）及评论',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'comments', type: 'int', default: 5, help: '返回评论数量' },
    ],
    columns: ['key', 'value'],
    func: async (page, kwargs) => {
        if (kwargs.comments < 0 || kwargs.comments > 50) {
            throw new ArgumentError('评论数量范围: 0-50');
        }
        const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${kwargs.aweme_id}&aid=6383`;
        const detailRes = await browserFetch(page, 'GET', detailUrl);
        const item = detailRes.aweme_detail;
        if (!item) {
            throw new CommandExecutionError('未找到视频', kwargs.aweme_id);
        }
        const rows = [
            { key: 'aweme_id', value: item.aweme_id },
            { key: 'author', value: item.author?.nickname ?? '' },
            { key: 'title', value: item.desc ?? '' },
            { key: 'create_time', value: new Date(item.create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) },
            { key: 'digg_count', value: String(item.statistics?.digg_count ?? 0) },
            { key: 'comment_count', value: String(item.statistics?.comment_count ?? 0) },
            { key: 'collect_count', value: String(item.statistics?.collect_count ?? 0) },
            { key: 'share_count', value: String(item.statistics?.share_count ?? 0) },
        ];
        if (kwargs.comments > 0) {
            const commentUrl = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${kwargs.aweme_id}&count=${kwargs.comments}&cursor=0&aid=6383`;
            const commentRes = await browserFetch(page, 'GET', commentUrl);
            const comments = commentRes.comments ?? [];
            rows.push({ key: '--- comments ---', value: '' });
            for (const c of comments) {
                rows.push({
                    key: `comment [${c.cid}]`,
                    value: `${c.user?.nickname ?? ''}: ${c.text ?? ''} (👍${c.digg_count ?? 0})`,
                });
            }
        }
        return rows;
    },
});
