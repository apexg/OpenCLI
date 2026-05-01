import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
cli({
    site: 'douyin',
    name: 'search',
    description: '根据关键词搜索视频',
    domain: 'www.douyin.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'keyword', required: true, positional: true, help: '搜索关键词' },
        { name: 'limit', type: 'int', default: 10, help: '返回数量（默认10）' },
    ],
    columns: ['aweme_id', 'title', 'author', 'digg_count', 'create_time'],
    func: async (page, kwargs) => {
        if (kwargs.limit < 1 || kwargs.limit > 50) {
            throw new ArgumentError('limit 范围: 1-50');
        }
        const js = `
      (async () => {
        const res = await fetch('https://www.douyin.com/aweme/v1/web/search/item/?keyword=${encodeURIComponent(kwargs.keyword)}&count=${kwargs.limit}&aid=1128', {
          credentials: 'include',
          headers: { referer: 'https://www.douyin.com/' }
        });
        return res.json();
      })()
    `;
        const res = await page.evaluate(js);
        if (res.status_code !== 0) {
            throw new Error(`搜索失败: ${JSON.stringify(res)}`);
        }
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