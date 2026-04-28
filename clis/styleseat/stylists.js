// styleseat stylists — extract hairstylist contact info + Instagram details + services
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';

cli({
  site: 'styleseat',
  name: 'stylists',
  description: '获取指定城市美发师列表及联系方式（含Instagram和服务）',
  domain: 'www.styleseat.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'city', type: 'string', default: 'los-angeles-ca', help: '城市代码' },
    { name: 'service', type: 'string', default: 'haircut', help: '服务类型' },
    { name: 'limit', type: 'int', default: 10, help: '获取数量' },
  ],
  columns: [
    'name', 'profession', 'phone', 'address', 'rating', 'reviews',
    'badge', 'distance', 'profileUrl', 'instagram', 'services'
  ],
  func: async (page, kwargs) => {
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 10, 50));
    const city = kwargs.city || 'los-angeles-ca';
    const service = kwargs.service || 'haircut';

    // 1. 打开搜索页
    await page.goto(`https://www.styleseat.com/m/search/${city}/${service}?sort=best`);
    await page.wait({ time: 2 });

    // 2. 提取搜索结果列表
    const results = await page.evaluate(`
      (() => {
        const data = [];
        const seen = new Set();

        document.querySelectorAll('a[href*="/m/v/"]').forEach(a => {
          const url = a.href;
          if (seen.has(url)) return;
          seen.add(url);

          const nameEl = a.querySelector('[data-testid=searchResult_profile_info__pro_name]');
          const ratingEl = a.querySelector('[data-testid=ss-pro-ratings-average]');
          const countEl = a.querySelector('[data-testid=ss-pro-ratings-count]');
          const distanceEl = a.querySelector('[data-testid=searchResult_profile_info__pro_distance]');
          const badgeEl = a.querySelector('[data-testid=ss-top-pro-text]');

          data.push({
            name: (nameEl?.textContent || '').trim(),
            rating: (ratingEl?.textContent || '').trim(),
            reviews: (countEl?.textContent || '').trim(),
            distance: (distanceEl?.textContent || '').trim(),
            badge: (badgeEl?.textContent || '').trim(),
            profileUrl: url,
          });
        });

        return data;
      })()
    `);

    const list = Array.isArray(results) ? results : [];
    if (list.length === 0) {
      throw new CliError('NO_DATA', '未找到美发师');
    }

    // 3. 访问个人页获取详细信息
    const output = [];
    for (const stylist of list.slice(0, limit)) {
      try {
        await page.goto(stylist.profileUrl);
        await page.wait({ time: 2 });

        // 提取 StyleSeat 详情 + Instagram username（从页面文本直接提取）
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

            // 从 React props 提取 Instagram username
            let igUsername = '';
            // 方法1: 从 React fiber 提取
            const igBtn = document.querySelector('[data-testid=pro-action-button-instagram]');
            if (igBtn) {
              const reactKey = Object.keys(igBtn).find(k => k.startsWith('__reactFiber'));
              if (reactKey) {
                let fiber = igBtn[reactKey];
                while (fiber) {
                  const props = fiber.memoizedProps;
                  if (props && props.profile && props.profile.instagram) {
                    igUsername = props.profile.instagram;
                    break;
                  }
                  fiber = fiber.return;
                }
              }
            }
            // 方法2: 从页面文本提取（备用）
            if (!igUsername) {
              const allDivs = document.querySelectorAll('div');
              for (const div of allDivs) {
                const text = (div.textContent || '');
                if (text.includes('instagram: @') && text.length < 30) {
                  igUsername = text.replace('instagram: @', '').trim();
                  break;
                }
              }
            }
            data.instagramUsername = igUsername;

            // 服务列表
            const services = [];
            document.querySelectorAll('[data-testid=profile-service-item-revamp-card]').forEach(card => {
              const nameEl = card.querySelector('[data-testid=profile-service-item-revamp-service-name]');
              const costEl = card.querySelector('[data-testid=profile-service-item-revamp-cost]');
              const durationEl = card.querySelector('[data-testid=profile-service-item-revamp-duration]');
              if (nameEl) {
                services.push({
                  name: (nameEl?.textContent || '').trim(),
                  cost: (costEl?.textContent || '').trim(),
                  duration: (durationEl?.textContent || '').trim(),
                });
              }
            });
            data.services = services;

            return data;
          })()
        `);

        output.push({
          name: detail.name || stylist.name,
          profession: detail.profession || '',
          phone: detail.phone || '',
          address: detail.address || '',
          rating: detail.rating || stylist.rating,
          reviews: detail.reviews || stylist.reviews,
          badge: detail.badge || stylist.badge,
          distance: stylist.distance || '',
          profileUrl: stylist.profileUrl,
          instagram: detail.instagramUsername || '',
          services: detail.services || [],
        });

      } catch (e) {
        // 失败时保留基础信息
        output.push({
          name: stylist.name,
          profession: '',
          phone: '',
          address: '',
          rating: stylist.rating,
          reviews: stylist.reviews,
          badge: stylist.badge,
          distance: stylist.distance,
          profileUrl: stylist.profileUrl,
          instagram: '',
          services: [],
        });
      }
    }

    return output;
  },
});