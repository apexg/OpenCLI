import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { CommandExecutionError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'video-detail',
    description: '获取视频详情（标题、描述、统计数据）及评论',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'aweme_id', required: true, positional: true, help: '视频 aweme_id' },
        { name: 'comments', type: 'int', default: 5, help: '返回评论数量（0=不获取评论，-1=获取所有评论）' },
        { name: 'replies', type: 'int', default: 0, help: '每条评论返回的回复数量（0=不获取回复，-1=获取所有回复）' },
    ],
    columns: ['key', 'value'],
    func: async (page, kwargs) => {
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
        if (kwargs.comments !== 0) {
            const allComments = [];
            let cursor = 0;
            let hasMore = true;
            const maxComments = kwargs.comments === -1 ? Infinity : kwargs.comments;
            const batchSize = 20;

            while (hasMore && allComments.length < maxComments) {
                const remaining = maxComments - allComments.length;
                const count = Math.min(batchSize, remaining);
                const commentUrl = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${kwargs.aweme_id}&count=${count}&cursor=${cursor}&aid=6383`;
                const commentRes = await browserFetch(page, 'GET', commentUrl);
                const comments = commentRes.comments ?? [];

                if (comments.length === 0) break;

                // 处理每条评论及其回复
                for (const c of comments) {
                    const commentData = {
                        cid: c.cid,
                        text: c.text ?? '',
                        nickname: c.user?.nickname ?? '',
                        digg_count: c.digg_count ?? 0,
                        create_time: c.create_time,
                        reply_count: c.reply_comment_total ?? 0,
                        replies: [],
                    };

                    // 获取回复评论
                    if (kwargs.replies !== 0 && c.reply_comment_total > 0) {
                        const maxReplies = kwargs.replies === -1 ? c.reply_comment_total : Math.min(kwargs.replies, c.reply_comment_total);
                        const replyUrl = `https://www.douyin.com/aweme/v1/web/comment/list/reply/?comment_id=${c.cid}&item_id=${kwargs.aweme_id}&count=${maxReplies}&cursor=0&aid=6383`;
                        try {
                            const replyRes = await browserFetch(page, 'GET', replyUrl);
                            const replyComments = replyRes.comments ?? [];
                            for (const r of replyComments) {
                                commentData.replies.push({
                                    cid: r.cid,
                                    text: r.text ?? '',
                                    nickname: r.user?.nickname ?? '',
                                    digg_count: r.digg_count ?? 0,
                                });
                            }
                        } catch (e) {
                            // 忽略获取回复失败的错误
                        }
                    }

                    allComments.push(commentData);
                }

                cursor = commentRes.cursor ?? (cursor + comments.length);
                hasMore = commentRes.has_more ?? false;
                if (comments.length < count) break;
            }

            rows.push({ key: '--- comments ---', value: '' });
            const displayComments = allComments.slice(0, maxComments);
            for (const c of displayComments) {
                rows.push({
                    key: `comment [${c.cid}]`,
                    value: `${c.nickname}: ${c.text} (👍${c.digg_count}${c.reply_count > 0 ? `, 💬${c.reply_count}` : ''})`,
                });
                // 显示回复
                for (const r of c.replies) {
                    rows.push({
                        key: `  └ reply [${r.cid}]`,
                        value: `${r.nickname}: ${r.text} (👍${r.digg_count})`,
                    });
                }
            }
            if (allComments.length > maxComments) {
                rows.push({ key: `... and ${allComments.length - maxComments} more`, value: '' });
            }
            rows.push({ key: `--- total: ${allComments.length} comments ---`, value: '' });
        }
        return rows;
    },
});
