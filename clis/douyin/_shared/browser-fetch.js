import { CommandExecutionError } from '@jackwener/opencli/errors';
/**
 * Execute a fetch() call inside the Chrome browser context via page.evaluate.
 * This ensures a_bogus signing and cookies are handled automatically by the browser.
 *
 * options.formBody: URLSearchParams string — sends as application/x-www-form-urlencoded
 * options.body:     object — sends as JSON (default)
 */
export async function browserFetch(page, method, url, options = {}) {
    const isForm = !!options.formBody;
    const contentType = isForm
        ? 'application/x-www-form-urlencoded'
        : 'application/json';
    const bodyJs = isForm
        ? `body: ${JSON.stringify(options.formBody)},`
        : options.body
            ? `body: JSON.stringify(${JSON.stringify(options.body)}),`
            : '';
    const js = `
    (async () => {
      const res = await fetch(${JSON.stringify(url)}, {
        method: ${JSON.stringify(method)},
        credentials: 'include',
        headers: {
          'Content-Type': ${JSON.stringify(contentType)},
          referer: 'https://www.douyin.com/',
          ...${JSON.stringify(options.headers ?? {})}
        },
        ${bodyJs}
      });
      return res.json();
    })()
  `;
    const result = await page.evaluate(js);
    if (result && typeof result === 'object' && 'status_code' in result) {
        const code = result.status_code;
        if (code !== 0) {
            const msg = result.status_msg ?? 'unknown error';
            throw new CommandExecutionError(`Douyin API error ${code}: ${msg}`);
        }
    }
    return result;
}
