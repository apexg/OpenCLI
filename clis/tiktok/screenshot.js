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
    name: 'screenshot',
    description: 'Take screenshot of TikTok user profile',
    domain: 'www.tiktok.com',
    strategy: Strategy.COOKIE,
    args: [
        {
            name: 'username',
            required: true,
            positional: true,
            help: 'TikTok username (without @)',
        },
        {
            name: 'path',
            default: '~/Downloads/TikTok',
            help: 'Screenshot output directory',
        },
    ],
    func: async (page, kwargs) => {
        if (!page) throw new CommandExecutionError('Browser session required');

        const username = String(kwargs.username ?? '').trim();
        if (!username) throw new CliError('MISSING_USERNAME', 'TikTok username is required');

        const outputRoot = String(kwargs.path ?? path.join(os.homedir(), 'Downloads', 'TikTok'))
            .replace(/^~/, os.homedir());

        const profileUrl = `https://www.tiktok.com/@${username}`;
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        const filename = `tiktok_${username}_profile.png`;
        fs.mkdirSync(outputRoot, { recursive: true });
        const destPath = path.join(outputRoot, filename);

        await page.screenshot({ path: destPath, fullPage: false });

        console.log(displayPath(destPath));

        return null;
    },
});