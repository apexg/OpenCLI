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
    // Safely handle form body by storing it in a variable first
    const js = `
    (async () => {
      try {
        const formBody = ${JSON.stringify(options.formBody || '')};
        const jsonData = ${JSON.stringify(options.body || null)};

        const requestOptions = {
          method: ${JSON.stringify(method)},
          credentials: 'include',
          headers: {
            'Content-Type': ${JSON.stringify(contentType)},
            referer: 'https://www.douyin.com/',
            ...${JSON.stringify(options.headers ?? {})}
          }
        };

        if (formBody) {
          requestOptions.body = formBody;
        } else if (jsonData) {
          requestOptions.body = JSON.stringify(jsonData);
        }

        const res = await fetch(${JSON.stringify(url)}, requestOptions);
        const text = await res.text();

        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('Failed to parse JSON response. First 500 chars:', text.substring(0, 500));
          throw new Error('JSON parse failed: ' + e.message);
        }
      } catch (error) {
        console.error('Fetch error:', error.message);
        throw error;
      }
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
