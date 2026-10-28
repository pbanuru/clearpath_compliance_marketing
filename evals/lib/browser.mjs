import { createRequire } from 'node:module';
// Resolve the separately installed eval dependency from its own package.
const evalRequire = createRequire(new URL('../package.json', import.meta.url));
const puppeteer = evalRequire('puppeteer-core');
import { existsSync } from 'node:fs';

export function launchBrowser() {
  const executablePath =
    process.env.EVALS_CHROME ??
    ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) =>
      existsSync(path),
    );
  if (!executablePath) throw new Error('Set EVALS_CHROME to a Chrome/Chromium executable.');
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });
}
