// styleseat all-stylists — extract all hairstylists from sitemap
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';

cli({
  site: 'styleseat',
  name: 'all-stylists',
  description: '从sitemap获取所有美发师信息（全量数据）',
  domain: 'www.styleseat.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'sitemapLimit', type: 'int', default: 20, help: 'sitemap数量限制（每个约1000人）' },
    { name: 'stylistLimit', type: 'int', default: 100, help: '美发师数量限制（总数）' },
  ],
  columns: [
    'name', 'profession', 'phone', 'address', 'rating', 'reviews',
    'badge', 'profileUrl', 'instagram', 'city', 'state'
  ],
  func: async (page, kwargs) => {
    const sitemapLimit = Math.max(1, Math.min(Number(kwargs.sitemapLimit) || 20, 20));
    const stylistLimit = Math.max(1, Math.min(Number(kwargs.stylistLimit) || 100, 20000));

    // 1. 获取所有美发师 URL（通过 sitemap）
    console.log('[SITEMAP] Fetching stylist URLs from sitemap...');
    const stylistUrls = [];

    for (let i = 1; i <= sitemapLimit; i++) {
      const sitemapUrl = `https://www.styleseat.com/sitemap-stylists-${i}.xml`;
      console.log(`[SITEMAP] Fetching ${sitemapUrl}`);

      try {
        // 使用 Node.js fetch 获取 sitemap
        const response = await fetch(sitemapUrl);
        const xmlText = await response.text();

        // 解析 XML 提取 URL
        const urlMatches = xmlText.match(/https:\/\/www\.styleseat\.com\/m\/v\/[a-zA-Z0-9_-]+/g);
        if (urlMatches) {
          stylistUrls.push(...urlMatches);
          console.log(`[SITEMAP] Found ${urlMatches.length} URLs in sitemap ${i}`);
        }

        // 达到限制就停止
        if (stylistUrls.length >= stylistLimit) {
          console.log(`[SITEMAP] Reached limit of ${stylistLimit}, stopping`);
          break;
        }
      } catch (e) {
        console.error(`[SITEMAP] Failed to fetch sitemap ${i}:`, e.message);
      }
    }

    if (stylistUrls.length === 0) {
      throw new CliError('NO_DATA', '未找到美发师URL');
    }

    console.log(`[SITEMAP] Total URLs: ${stylistUrls.length}`);

    // 2. 访问每个美发师页面提取信息
    const output = [];
    const urlsToProcess = stylistUrls.slice(0, stylistLimit);

    for (const profileUrl of urlsToProcess) {
      try {
        console.log(`[STYLIST] Processing: ${profileUrl}`);
        await page.goto(profileUrl);
        await page.wait({ time: 2 });

        // 提取详细信息
        const detail = await page.evaluate(`
          (() => {
            const data = {};

            const nameEl = document.querySelector('[data-testid=proName]');
            data.name = (nameEl?.textContent || '').trim();

            const professionEl = document.querySelector('[data-testid=proProfession]');
            data.profession = (professionEl?.textContent || '').trim();

            const phoneEl = document.querySelector('[data-testid=sidebar-location-phone]');
            data.phone = (phoneEl?.textContent || '').trim();

            const addrEl = document.querySelector('[data-testid=address-component]');
            data.address = (addrEl?.innerText || '').trim().replace(/\\n/g, ', ');

            const ratingEl = document.querySelector('[data-testid=ss-pro-ratings-average]');
            data.rating = (ratingEl?.textContent || '').trim();

            const reviewsEl = document.querySelector('[data-testid=ss-pro-ratings-count]');
            data.reviews = (reviewsEl?.textContent || '').trim();

            const badgeEl = document.querySelector('[data-testid=ss-top-pro-text]');
            data.badge = (badgeEl?.textContent || '').trim();

            // 从 React props 提取 Instagram 和城市信息
            const igBtn = document.querySelector('[data-testid=pro-action-button-instagram]');
            if (igBtn) {
              const reactKey = Object.keys(igBtn).find(k => k.startsWith('__reactFiber'));
              if (reactKey) {
                let fiber = igBtn[reactKey];
                while (fiber) {
                  const props = fiber.memoizedProps;
                  if (props && props.profile) {
                    data.instagram = props.profile.instagram || '';
                    data.city = props.profile.city || '';
                    data.state = props.profile.state || '';
                    break;
                  }
                  fiber = fiber.return;
                }
              }
            }

            return data;
          })()
        `);

        output.push({
          name: detail.name || '',
          profession: detail.profession || '',
          phone: detail.phone || '',
          address: detail.address || '',
          rating: detail.rating || '',
          reviews: detail.reviews || '',
          badge: detail.badge || '',
          profileUrl: profileUrl,
          instagram: detail.instagram || '',
          city: detail.city || '',
          state: detail.state || '',
        });

      } catch (e) {
        console.error(`[STYLIST] Failed to process ${profileUrl}:`, e.message);
        // 保留基础信息
        output.push({
          name: '',
          profession: '',
          phone: '',
          address: '',
          rating: '',
          reviews: '',
          badge: '',
          profileUrl: profileUrl,
          instagram: '',
          city: '',
          state: '',
        });
      }
    }

    console.log(`[DONE] Processed ${output.length} stylists`);
    return output;
  },
});