import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError, CommandExecutionError } from '@jackwener/opencli/errors';

function displayPath(filePath) {
    const home = os.homedir();
    return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

cli({
    site: 'tiktok',
    name: 'download',
    description: 'Download TikTok video to local directory',
    domain: 'www.tiktok.com',
    strategy: Strategy.COOKIE,
    args: [
        {
            name: 'url',
            required: true,
            positional: true,
            help: 'TikTok video URL',
        },
        {
            name: 'path',
            default: '~/Downloads/TikTok',
            help: 'Download directory',
        },
    ],
    columns: ['filePath'],
    func: async (page, kwargs) => {
        if (!page) throw new CommandExecutionError('Browser session required');

        const videoUrl = String(kwargs.url ?? '').trim();
        if (!videoUrl) throw new CliError('MISSING_URL', 'TikTok video URL is required');

        const outputRoot = String(kwargs.path ?? path.join(os.homedir(), 'Downloads', 'TikTok'))
            .replace(/^~/, os.homedir());

        await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));

        // Extract video info from page data
        const result = await page.evaluate(`(() => {
            try {
                const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
                if (!script) return { error: 'SCRIPT_NOT_FOUND' };

                const data = JSON.parse(script.textContent);
                const videoDetail = data['__DEFAULT_SCOPE__']?.['webapp.video-detail'];
                if (!videoDetail) return { error: 'NO_VIDEO_DETAIL' };

                const item = videoDetail.itemInfo?.itemStruct;
                if (!item?.video) return { error: 'NO_VIDEO' };

                const v = item.video;

                let bestUrl = '';

                if (v.bitrateInfo && v.bitrateInfo.length > 0) {
                    const sorted = [...v.bitrateInfo].sort((a, b) => (b.Bitrate || 0) - (a.Bitrate || 0));
                    const best = sorted[0];
                    const urls = best.PlayAddr?.UrlList;
                    if (urls && urls.length > 0) {
                        bestUrl = urls[0];
                    }
                }

                if (!bestUrl && v.PlayAddrStruct?.UrlList?.length > 0) {
                    bestUrl = v.PlayAddrStruct.UrlList[0];
                }

                return {
                    videoUrl: bestUrl,
                    videoId: item.id,
                    author: item.author?.uniqueId || 'unknown',
                    duration: v.duration,
                    ratio: v.ratio,
                };
            } catch (e) {
                return { error: e.message };
            }
        })()`);

        if (!result) throw new CliError('NO_DATA', 'No video data returned');
        if (result.error) throw new CliError('PARSE_ERROR', `Failed to extract video info: ${result.error}`);
        if (!result.videoUrl) throw new CliError('NO_VIDEO_URL', 'Could not extract video download URL');

        const filename = `tiktok_${result.videoId}.mp4`;
        fs.mkdirSync(outputRoot, { recursive: true });
        const destPath = path.join(outputRoot, filename);

        // Download via browser fetch (has correct cookies/referer/signature)
        // Inject URL as a string literal to avoid argument-passing issues with page.evaluate
        const escapedUrl = result.videoUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const downloadResult = await page.evaluate(`(async () => {
            try {
                const url = '${escapedUrl}';
                const resp = await fetch(url, { mode: 'cors', credentials: 'include' });
                if (!resp.ok) {
                    const text = await resp.text().catch(() => '');
                    return { error: 'HTTP ' + resp.status, detail: text.substring(0, 200) };
                }

                const buffer = await resp.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const totalSize = bytes.length;

                // Encode as base64 chunks for CDP transfer
                const CHUNK = 2 * 1024 * 1024;
                const parts = [];
                for (let i = 0; i < totalSize; i += CHUNK) {
                    const slice = bytes.subarray(i, Math.min(i + CHUNK, totalSize));
                    let binary = '';
                    for (let j = 0; j < slice.length; j++) {
                        binary += String.fromCharCode(slice[j]);
                    }
                    parts.push(btoa(binary));
                }

                return { success: true, totalSize, parts };
            } catch (e) {
                return { error: e.message };
            }
        })()`);

        if (!downloadResult || downloadResult.error) {
            throw new CommandExecutionError(`Failed to download video: ${downloadResult?.error || 'unknown error'}${downloadResult?.detail ? ' - ' + downloadResult.detail : ''}`);
        }

        // Decode base64 chunks and write to file
        const fd = fs.openSync(destPath, 'w');
        try {
            let offset = 0;
            for (const part of downloadResult.parts) {
                const buf = Buffer.from(part, 'base64');
                fs.writeSync(fd, buf, 0, buf.length, offset);
                offset += buf.length;
            }
        } finally {
            fs.closeSync(fd);
        }

        console.log(displayPath(destPath));

        return null;
    },
});
