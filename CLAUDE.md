# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build           # Build TypeScript (tsc + copy-yaml + build-manifest)
npm run dev             # Development mode with tsx
npx tsc --noEmit        # Type check without emitting
npm test                # Default local tests (unit + extension + adapter)
npm run test:adapter    # Adapter project only
npx vitest run tests/e2e/    # E2E tests (real CLI calls)
npx vitest run tests/smoke/  # Smoke tests (API health, validation)
npx vitest run          # All tests
npx vitest src/         # Watch mode for unit tests
```

Single test file:
```bash
npm test -- --run clis/apple-podcasts/commands.test.ts
npx vitest run tests/e2e/management.test.ts
```

## Architecture Overview

OpenCLI turns websites, browser sessions, and Electron apps into CLI commands.

### Core Flow
- **Entry**: `src/main.ts` — fast paths for `--version`, `completion`, `--get-completions`; then full discovery
- **Discovery**: `src/discovery.ts` — loads adapters from `clis/` via manifest or filesystem scan
- **Registry**: `src/registry.ts` — global command registry, `cli()` registration function, Strategy enum
- **Execution**: `src/cli.ts` — Commander wiring, built-in commands (`list`, `validate`, `browser`), adapter dispatch
- **Pipeline**: `src/pipeline/executor.ts` — declarative step executor (fetch, map, filter, limit, etc.)

### Key Directories
- `clis/<site>/<command>.js` — Built-in adapters (90+ sites)
- `extension/` — Browser Bridge Chrome extension (CDP connection)
- `src/browser/` — Browser automation: CDP (`cdp.ts`), DOM snapshot (`dom-snapshot.ts`), page operations
- `skills/` — AI agent skills: `opencli-adapter-author`, `opencli-autofix`, `opencli-browser`, `opencli-usage`, `smart-search`

### Adapter Patterns

**Pipeline adapter** (declarative, preferred for data-fetching):
```js
import { cli, Strategy } from '@jackwener/opencli/registry';
cli({
  site: 'mysite',
  name: 'trending',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [{ name: 'limit', type: 'int', default: 20 }],
  columns: ['title', 'url'],
  pipeline: [
    { fetch: { url: 'https://api.mysite.com/trending' } },
    { map: { title: '${{ item.title }}', url: '${{ item.url }}' } },
    { limit: '${{ args.limit }}' },
  ],
});
```

**func() adapter** (complex browser interactions):
```js
cli({
  site: 'mysite',
  name: 'search',
  strategy: Strategy.COOKIE,
  args: [{ name: 'query', positional: true, required: true }],
  func: async (page, kwargs) => {
    await page.goto('https://mysite.com');
    return await page.evaluate(`...`);
  },
});
```

### Strategy Types
- `PUBLIC`: No authentication, direct API calls
- `COOKIE`: Uses browser cookies (needs Chrome with Browser Bridge)
- `HEADER`: Injects auth headers via interceptor
- `INTERCEPT`: Captures network responses in browser
- `UI`: Pure DOM-based scraping

### Browser Commands
`opencli browser <cmd>` primitives for AI agents:
- `open`, `state`, `click`, `type`, `select`, `keys`, `wait`, `get`, `find`, `extract`
- `frames`, `screenshot`, `scroll`, `back`, `eval`, `network`
- `tab list`, `tab new`, `tab select`, `tab close`
- `init`, `verify`, `close`

### Test Structure
- Unit: `src/**/*.test.ts`
- Adapter: `clis/**/*.test.{ts,js}`
- E2E: `tests/e2e/*.test.ts` — real CLI execution via `runCli()`
- Smoke: `tests/smoke/*.test.ts` — API health, manifest validation

## Code Style

- TypeScript strict mode, ES Modules with `.js` extensions in imports
- `kebab-case` files, `camelCase` variables, `PascalCase` types
- No default exports — use named exports
- Conventional Commits: `feat(twitter): add thread command`

## Arg Convention

Positional for primary required argument (query, symbol, id, url, username). Named `--flag` for secondary/optional config (limit, format, sort, page).

## Adding a New Adapter

1. Create `clis/<site>/<command>.js` using pipeline or func() pattern
2. Run `opencli validate` to check registration
3. Test: `opencli <site> <command> --limit 3 -f json`
4. Add test in appropriate E2E file based on strategy/browser requirement
5. See `skills/opencli-adapter-author/SKILL.md` for full workflow

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCLI_CDP_ENDPOINT` | CDP endpoint URL — bypass Browser Bridge extension, connect directly to Chrome (e.g. `http://localhost:9222`) |
| `OPENCLI_CDP_STEALTH` | Inject anti-detection patches. Default `true`, set `false` to disable when your Chrome already has stealth |
| `OPENCLI_CDP_TARGET` | Filter CDP targets by URL/title substring when multiple pages exist |
| `OPENCLI_DAEMON_PORT` | HTTP port for daemon-extension bridge (default: 19825) |
| `OPENCLI_VERBOSE` / `-v` | Enable verbose logging |
| `OPENCLI_LIVE` / `--live` | Keep automation window open after command |
| `OPENCLI_WINDOW_FOCUSED` / `--focus` | Open automation window in foreground |

## Direct CDP Mode (No Extension)

When `OPENCLI_CDP_ENDPOINT` is set, OpenCLI connects directly to Chrome via CDP without needing the Browser Bridge extension:

```bash
# Start Chrome with CDP
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-debug-profile"

# Login to target sites in Chrome, then run commands
export OPENCLI_CDP_ENDPOINT="http://localhost:9222"
export OPENCLI_CDP_STEALTH=false  # Optional: disable stealth injection
opencli bilibili me -f json
```