import { cli, Strategy } from '@jackwener/opencli/registry';
import { browserFetch } from './_shared/browser-fetch.js';
import { ArgumentError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'search-sort',
    description: '根据关键词搜索视频（支持排序）',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'keyword', required: true, positional: true, help: '搜索关键词' },
        { name: 'sort', required: true, positional: true, choices: ['default', 'most_like', 'latest'], help: '排序方式：default=综合排序, most_like=最多点赞, latest=最新发布' },
        { name: 'limit', type: 'int', default: 10, help: '返回数量（默认10）' },
    ],
    columns: ['aweme_id', 'title', 'author', 'digg_count', 'create_time'],
    func: async (page, kwargs) => {
        if (kwargs.limit < 1 || kwargs.limit > 50) {
            throw new ArgumentError('limit 范围: 1-50');
        }

        // 映射排序参数到 API 参数
        const sortTypeMap = {
            'default': 0,    // 综合排序
            'most_like': 1,  // 最多点赞
            'latest': 2      // 最新发布
        };
        const sortType = sortTypeMap[kwargs.sort] ?? 0;

        // 构建 URL，添加 sort_type 参数
        let url = `https://www.douyin.com/aweme/v1/web/search/item/?keyword=${encodeURIComponent(kwargs.keyword)}&count=${kwargs.limit}&aid=1128`;

        // 如果不是默认排序，添加 sort_type 参数
        if (sortType !== 0) {
            url += `&sort_type=${sortType}`;
        }

        const res = await browserFetch(page, 'GET', url);
        const awemeList = res.data?.map(d => d.aweme_info).filter(Boolean) ?? [];

        return awemeList.map(item => ({
            aweme_id: item.aweme_id,
            title: item.desc ?? '',
            author: item.author?.nickname ?? '',
            digg_count: String(item.statistics?.digg_count ?? 0),
            create_time: new Date(item.create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        }));
    },
});
