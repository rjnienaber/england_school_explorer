// A page object for the explorer, shared by every spec. Prefers what a visitor sees (roles, labels, text); the few
// CSS selectors are in one place here so a markup change is a one-line fix.
import { expect, type Locator, type Page } from '@playwright/test';
import type { CoreSchool } from './data.ts';

interface ExplorerHook {
  map: {
    jumpTo(o: unknown): void;
    project(lngLat: [number, number]): { x: number; y: number };
    getCanvas(): HTMLCanvasElement;
    getSource(id: string): unknown;
    getLayer(id: string): unknown;
    loaded(): boolean;
    isMoving(): boolean;
    once(event: string, fn: () => void): void;
    triggerRepaint(): void;
    queryRenderedFeatures(point: [number, number], options: { layers: string[] }): { properties: { urn: number } }[];
  };
  shownCount(): number;
}
declare global {
  interface Window {
    __explorer?: ExplorerHook;
  }
}

export class Explorer {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ---------- Loading ----------

  /** Opens the site (`query` like `?phase=primary` or `urn=123`) and waits until the dots and legend are drawn. */
  async open(query = ''): Promise<void> {
    await this.page.goto(query ? `/?${query.replace(/^\?/, '')}` : '/');
    await this.ready();
  }

  /** The map exists, the school dots are in it, and the legend is filled in. */
  async ready(): Promise<void> {
    await this.page.waitForFunction(() => {
      const map = window.__explorer?.map;
      return !!map && !!map.getLayer('schools') && !!map.getSource('schools') && document.querySelectorAll('#legend li').length > 0;
    });
  }

  // ---------- Panel ----------

  get panel(): Locator {
    return this.page.getByRole('complementary', { name: 'Map controls' });
  }
  get legend(): Locator {
    return this.page.locator('#legend');
  }
  get title(): Locator {
    return this.page.locator('.panel-title');
  }
  mode(name: string | RegExp): Locator {
    return this.page.getByRole('radiogroup', { name: 'Colour schools by' }).getByRole('radio', { name });
  }
  phase(name: 'Secondary' | 'Primary'): Locator {
    return this.page.getByRole('radiogroup', { name: 'Phase of school' }).getByRole('radio', { name });
  }
  /** A checkbox under "Show". Its group may be folded away, so it is opened first. */
  async filterCheckbox(label: string | RegExp): Promise<Locator> {
    const box = this.panel.getByRole('checkbox', { name: label });
    if (!(await box.isVisible())) {
      for (const summary of await this.panel.locator('details.filter-group > summary').all()) {
        if (await box.isVisible()) break;
        await summary.click();
      }
    }
    return box;
  }

  /** Number of schools currently drawn as dots. */
  async dotCount(): Promise<number> {
    return this.page.evaluate(() => window.__explorer!.shownCount());
  }
  /** The labels in the legend, in order (colour swatches carry no text of their own). */
  async legendLabels(): Promise<string[]> {
    return (await this.legend.locator('li').allInnerTexts()).map((t) => t.replace(/\s*[\d,]+\s*$/, '').trim());
  }
  /** The counts in the legend, which add up to the schools in view. */
  async legendCounts(): Promise<number[]> {
    const counts = await this.legend.locator('li .count').allInnerTexts();
    return counts.map((c) => Number(c.replace(/,/g, '')));
  }
  /** Waits for the "Loading…" state of a newly chosen view to finish. */
  async settled(): Promise<void> {
    await expect(this.legend).not.toHaveAttribute('aria-busy', 'true');
  }

  // ---------- Page-level state ----------

  /** The address's query string as a URLSearchParams. */
  query(): URLSearchParams {
    return new URL(this.page.url()).searchParams;
  }
  get horizontalScroll(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }

  // ---------- Popups ----------

  get popup(): Locator {
    return this.page.locator('.maplibregl-popup .school-popup');
  }
  popupGroup(name: string | RegExp): Locator {
    return this.popup.locator('details.popup-group').filter({ has: this.page.locator(':scope > summary', { hasText: name }) });
  }

  /**
   * Opens a school's popup the way a visitor does: the map is moved to the school and its dot is clicked. Pick schools
   * with `isolated()` (data.ts) so no other dot is under the pointer.
   */
  async clickDot(school: Pick<CoreSchool, 'urn' | 'lng' | 'lat'>): Promise<void> {
    await this.page.evaluate(
      async ({ lng, lat }) => {
        const map = window.__explorer!.map;
        // Zoom 14, with the dot just right of the panel
        map.jumpTo({ center: [lng, lat], zoom: 14 });
        await new Promise<void>((resolve) => {
          const check = () => (map.loaded() && !map.isMoving() ? resolve() : requestAnimationFrame(check));
          check();
        });
      },
      { lng: school.lng, lat: school.lat },
    );
    // Wait until the dot is really drawn under that point (new tiles of dots are cut asynchronously after a move)
    const handle = await this.page.waitForFunction(
      ({ lng, lat, urn }) => {
        const map = window.__explorer!.map;
        const { x, y } = map.project([lng, lat]);
        const hit = map.queryRenderedFeatures([x, y], { layers: ['schools'] }).some((f) => f.properties.urn === urn);
        const box = map.getCanvas().getBoundingClientRect();
        return hit ? { x: box.left + x, y: box.top + y } : null;
      },
      { lng: school.lng, lat: school.lat, urn: school.urn },
    );
    const point = (await handle.jsonValue()) as { x: number; y: number };
    await this.page.mouse.click(point.x, point.y);
    await expect.poll(() => this.query().get('urn')).toBe(String(school.urn));
    await expect(this.popup).toBeVisible();
  }

  /**
   * Holds back every school-detail download (the popup's lazy part) until the returned function is called, so a test
   * can look at the popup while it is still loading. Set it up before opening the popup.
   */
  async holdDetails(): Promise<() => void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await this.page.route('**/data/**/details/*.json*', async (route) => {
      await gate;
      await route.continue();
    });
    await this.page.route('**/data/details/*.json*', async (route) => {
      await gate;
      await route.continue();
    });
    return release;
  }

  /** The popup's text has finished loading (the "Loading…" note is gone and the lazy sections are in). */
  async detailsLoaded(): Promise<void> {
    await expect(this.popup).toBeVisible();
    await expect(this.popup.locator('.loading-note')).toHaveCount(0);
  }

  // ---------- Shortlist and comparison ----------

  get shortlist(): Locator {
    return this.page.getByRole('region', { name: 'Shortlist' });
  }
  get comparison(): Locator {
    return this.page.getByRole('dialog', { name: /^Comparing \d+ schools$/ });
  }
  /** Adds the school whose popup is open. */
  async addToShortlist(): Promise<void> {
    await this.popup.getByRole('button', { name: 'Add to shortlist' }).click();
    await expect(this.popup.getByRole('button', { name: 'Remove from shortlist' })).toBeVisible();
  }
  /** Opens each school's popup, waits for its details, and adds it to the shortlist. */
  async shortlistSchools(schools: Pick<CoreSchool, 'urn' | 'lng' | 'lat'>[]): Promise<void> {
    for (const s of schools) {
      await this.clickDot(s);
      await this.detailsLoaded();
      await this.addToShortlist();
    }
  }
  /** The names of the schools in the panel's shortlist. */
  async shortlistNames(): Promise<string[]> {
    return this.shortlist.locator('li [data-cmp-open]').allInnerTexts();
  }
  async openComparison(): Promise<Locator> {
    await this.shortlist.getByRole('button', { name: 'Compare' }).click();
    await expect(this.comparison).toBeVisible();
    await expect(this.comparison.getByRole('table').first()).toBeVisible();
    // The simulation block is the last thing filled in
    await expect(this.comparison.locator('#cmp-sim .cmp-result').first()).toBeVisible();
    return this.comparison;
  }
  /** The text of the simulated results (chance of being strongest, likely place), for checking they do not change. */
  async simulationText(): Promise<string> {
    return this.comparison.locator('#cmp-sim').innerText();
  }
}
