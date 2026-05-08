import { cli } from '@jackwener/opencli/registry';

cli({
    site: 'tiktok',
    name: 'transcript',
    description: 'Get video captions/transcript from a TikTok video',
    domain: 'www.tiktok.com',
    args: [
        {
            name: 'url',
            required: true,
            positional: true,
            help: 'TikTok video URL',
        },
    ],
    columns: ['language', 'isAutoGen', 'content'],
    pipeline: [
        { navigate: { url: '${{ args.url }}', settleMs: 5000 } },
        { evaluate: `(async () => {
            const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
            if (!script) throw new Error('Could not find video data');

            const data = JSON.parse(script.textContent);
            const videoDetail = data['__DEFAULT_SCOPE__']?.['webapp.video-detail'];
            if (!videoDetail) throw new Error('Video data not found');

            const video = videoDetail.itemInfo?.itemStruct?.video;
            if (!video?.claInfo) throw new Error('No captions available for this video');

            const captionInfos = video.claInfo.captionInfos || [];
            if (captionInfos.length === 0) throw new Error('No captions available');

            // Prefer English, fallback to original
            let caption = captionInfos.find(c => c.language === 'eng-US');
            if (!caption) caption = captionInfos.find(c => c.isOriginalCaption);
            if (!caption) caption = captionInfos[0];

            // Fetch subtitle content
            const vttUrl = caption.url || caption.urlList?.[0];
            if (!vttUrl) throw new Error('No subtitle URL found');

            const resp = await fetch(vttUrl);
            if (!resp.ok) throw new Error('Failed to fetch subtitle: ' + resp.status);

            const vttText = await resp.text();

            // Parse WebVTT
            const lines = vttText.split('\\n');
            const content = [];
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'WEBVTT') continue;
                if (/^\\d{2}:\\d{2}:\\d{2}/.test(trimmed)) continue;
                if (/^\\d+$/.test(trimmed)) continue;
                if (trimmed.startsWith('NOTE') || trimmed.startsWith('STYLE')) continue;
                content.push(trimmed);
            }

            return [{
                language: caption.language,
                isAutoGen: caption.isAutoGen,
                content: content.join(' ').replace(/\\s+/g, ' ').trim(),
            }];
        })()` },
    ],
});
