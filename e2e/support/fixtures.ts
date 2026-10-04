// The test every spec file imports instead of Playwright's own. It adds, for every test:
//  - no third-party traffic: the OpenFreeMap style is replaced by an empty one (so no tiles are asked for) and the
//    postcodes.io lookup by a fixed answer; any other request to another site is refused and fails the test;
//  - failure on any uncaught page error or console.error, apart from the short allowlist below;
//  - `window.__E2E__`, which makes the page expose its map (see the end of web/main.ts);
//  - an `explorer` page object (see explorer.ts).
import { expect, test as base, type Page, type Route } from '@playwright/test';
import { Explorer } from './explorer.ts';

/** Console errors that are not the site's fault. Keep this short and say why for each entry. */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [
  // (none needed: the style stub has no sources, so there are no tile requests to fail)
];

/** A style with nothing in it but a background, in the colour the real one would have. */
const styleFor = (url: string) => ({
  version: 8,
  name: url.includes('/dark') ? 'stub-dark' : 'stub-light',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': url.includes('/dark') ? '#1b1b1b' : '#e8e8e8' } }],
});

async function stubExternal(page: Page, baseUrl: string, problems: string[], styles: string[]): Promise<void> {
  const origin = new URL(baseUrl).origin;
  await page.route(
    (url) => url.origin !== origin && /^https?:$/.test(url.protocol),
    (route: Route) => {
      const url = route.request().url();
      if (url.startsWith('https://tiles.openfreemap.org/styles/')) {
        styles.push(url);
        return route.fulfill({ json: styleFor(url) });
      }
      if (url.startsWith('https://api.postcodes.io/')) {
        // Fixed answer for any postcode: central Birmingham
        return route.fulfill({ json: { status: 200, result: { longitude: -1.9, latitude: 52.48 } } });
      }
      problems.push(`unexpected request to another site: ${url}`);
      return route.abort();
    },
  );
}

export const test = base.extend<{ explorer: Explorer; problems: string[]; styleRequests: string[] }>({
  problems: async ({}, use) => {
    await use([]);
  },
  styleRequests: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, baseURL, problems, styleRequests }, use) => {
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !ALLOWED_CONSOLE_ERRORS.some((re) => re.test(m.text()))) problems.push(`console.error: ${m.text()}`);
    });
    await page.addInitScript(() => {
      (window as unknown as { __E2E__: boolean }).__E2E__ = true;
    });
    await stubExternal(page, baseURL!, problems, styleRequests);
    await use(page);
    // Checked after the test body, so a test that passes its own assertions still fails on a hidden error
    expect(problems, 'errors reported by the page').toEqual([]);
  },
  explorer: async ({ page }, use) => {
    await use(new Explorer(page));
  },
});

export { expect };
