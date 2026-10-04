// Page load, in both phases: the map and its dots, the legend, the title, the phase switch.
import { loadBuiltCore } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

test.describe('secondary (the default phase)', () => {
  test('loads the map, the dots and the legend', async ({ explorer, page, styleRequests }) => {
    await explorer.open();
    await expect(explorer.title).toHaveText('Secondary schools in England');
    await expect(page.getByRole('region', { name: 'Map of secondary schools' })).toBeVisible();
    await expect(explorer.legend).toBeVisible();

    // Independent schools are off by default, so the dots are fewer than the schools in the data
    const total = loadBuiltCore('secondary').core.count;
    expect(total).toBeGreaterThan(4000);
    expect(total).toBeLessThan(4500);
    const dots = await explorer.dotCount();
    expect(dots).toBeGreaterThan(3000);
    expect(dots).toBeLessThanOrEqual(total);

    // Five performance bands and "No data", and the counts in view add up to the dots (England fits the window)
    expect(await explorer.legendLabels()).toEqual(['Well above average', 'Above average', 'Average', 'Below average', 'Well below average', 'No data']);
    const counts = await explorer.legendCounts();
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(dots * 0.9);

    // The tile service was never contacted: the basemap style came from the stub
    expect(styleRequests).toEqual(['https://tiles.openfreemap.org/styles/positron']);
    expect(explorer.query().toString()).toBe('');
  });

  test('showing independent schools too brings the dots up to every school in the data', async ({ explorer }) => {
    await explorer.open();
    const before = await explorer.dotCount();
    await (await explorer.filterCheckbox('Independent')).check();
    await explorer.settled();
    await expect.poll(() => explorer.dotCount()).toBe(loadBuiltCore('secondary').core.count);
    expect(await explorer.dotCount()).toBeGreaterThan(before);
  });

  test('says where the data comes from and when it was built', async ({ explorer, page }) => {
    await explorer.open();
    await expect(page.locator('#data-dates')).not.toBeEmpty();
    await expect(page.locator('#about')).toContainText(/open mainstream secondary schools/);
  });
});

test.describe('primary (?phase=primary)', () => {
  test('loads the map, the dots and the legend', async ({ explorer, page }) => {
    await explorer.open('phase=primary');
    await expect(explorer.title).toHaveText('Primary schools in England');
    await expect(page.getByRole('region', { name: 'Map of primary schools' })).toBeVisible();
    await expect(explorer.phase('Primary')).toHaveAttribute('aria-checked', 'true');
    await expect(explorer.legend).toBeVisible();

    const total = loadBuiltCore('primary').core.count;
    expect(total).toBeGreaterThan(14_000);
    expect(total).toBeLessThan(19_000);
    // Every primary school is drawn by default
    expect(await explorer.dotCount()).toBe(total);
    expect(await explorer.legendLabels()).toEqual(['Top 20%', '60–80th percentile', '40–60th percentile', '20–40th percentile', 'Bottom 20%', 'No data']);
    expect(explorer.query().get('phase')).toBe('primary');
  });

  test('has its own colour modes', async ({ explorer }) => {
    await explorer.open('phase=primary');
    for (const name of ['KS2 expected standard', 'KS2 higher standard', 'KS2 progress', 'Ofsted']) await expect(explorer.mode(name)).toBeVisible();
    await expect(explorer.mode('Progress 8')).toHaveCount(0);
  });
});

test.describe('the phase switch', () => {
  test('switches between the phases, keeping each phase’s own address', async ({ explorer, page }) => {
    await explorer.open();
    await expect(explorer.phase('Secondary')).toHaveAttribute('aria-checked', 'true');
    await explorer.phase('Primary').click();
    await page.waitForURL(/phase=primary/);
    await explorer.ready();
    await expect(explorer.title).toHaveText('Primary schools in England');

    // The choice is remembered: the bare address opens in the phase last used
    await explorer.open();
    await expect(explorer.title).toHaveText('Primary schools in England');

    await explorer.phase('Secondary').click();
    await page.waitForURL((url) => !url.searchParams.has('phase') || url.searchParams.get('phase') === 'secondary');
    await explorer.ready();
    await expect(explorer.title).toHaveText('Secondary schools in England');
    expect(explorer.query().has('phase')).toBe(false);
  });
});
