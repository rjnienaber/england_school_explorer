// Colour modes, checkbox filters and focus (chip) filters.
import { aTrust } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

test.describe('colour modes', () => {
  test('choosing another mode updates the legend, the description and the list heading', async ({ explorer, page }) => {
    await explorer.open();
    await expect(explorer.mode('Progress 8')).toHaveAttribute('aria-checked', 'true');
    const progress8 = await explorer.legendLabels();
    const description = await page.locator('#mode-description').innerText();
    await expect(page.locator('#list-heading')).toHaveText('Schools in view by Progress 8');

    await explorer.mode('Ofsted').click();
    await expect(explorer.mode('Ofsted')).toHaveAttribute('aria-checked', 'true');
    await expect(explorer.mode('Progress 8')).toHaveAttribute('aria-checked', 'false');
    await explorer.settled();
    await expect(page.locator('#list-heading')).toHaveText('Schools in view by Ofsted');
    const ofsted = await explorer.legendLabels();
    expect(ofsted).not.toEqual(progress8);
    expect(ofsted[0]).toMatch(/^Outstanding/);
    expect(ofsted.at(-1)).toBe('No data');
    expect(await page.locator('#mode-description').innerText()).not.toBe(description);
    // Every school is still in one band or "No data"
    expect((await explorer.legendCounts()).reduce((a, b) => a + b, 0)).toBeGreaterThan(3000);
  });

  test('every secondary mode loads without errors and draws a legend', async ({ explorer }) => {
    await explorer.open();
    const modes = await explorer.page.getByRole('radiogroup', { name: 'Colour schools by' }).getByRole('radio').all();
    expect(modes.length).toBeGreaterThanOrEqual(8);
    for (const mode of modes) {
      await mode.click();
      await explorer.settled();
      await expect(mode).toHaveAttribute('aria-checked', 'true');
      expect((await explorer.legendLabels()).length).toBeGreaterThanOrEqual(3);
    }
  });

  test('the chosen mode is remembered after a reload', async ({ explorer }) => {
    await explorer.open();
    await explorer.mode('Absence').click();
    await explorer.settled();
    await explorer.page.reload();
    await explorer.ready();
    await expect(explorer.mode('Absence')).toHaveAttribute('aria-checked', 'true');
  });

  test('primary: switching mode updates the legend', async ({ explorer }) => {
    await explorer.open('phase=primary');
    const before = await explorer.legendLabels();
    await explorer.mode('Ofsted').click();
    await explorer.settled();
    expect(await explorer.legendLabels()).not.toEqual(before);
    expect((await explorer.legendLabels())[0]).toMatch(/^Outstanding/);
  });
});

test.describe('checkbox filters', () => {
  test('unticking "Selective (grammar)" drops the grammar schools, and the choice survives a reload', async ({ explorer }) => {
    await explorer.open();
    const before = await explorer.dotCount();
    const box = await explorer.filterCheckbox('Selective (grammar)');
    await expect(box).toBeChecked();
    await box.uncheck();
    await explorer.settled();
    await expect.poll(() => explorer.dotCount()).toBeLessThan(before);
    const after = await explorer.dotCount();
    // England has some 160 grammar schools: a visible drop, not a collapse
    expect(before - after).toBeGreaterThan(100);
    expect(before - after).toBeLessThan(250);

    await explorer.page.reload();
    await explorer.ready();
    expect(await explorer.dotCount()).toBe(after);
    await expect(await explorer.filterCheckbox('Selective (grammar)')).not.toBeChecked();

    await (await explorer.filterCheckbox('Selective (grammar)')).check();
    await explorer.settled();
    await expect.poll(() => explorer.dotCount()).toBe(before);
  });

  test('"Boarding schools only" keeps a small set and the legend follows', async ({ explorer }) => {
    await explorer.open();
    const before = await explorer.dotCount();
    await (await explorer.filterCheckbox('Boarding schools only')).check();
    await explorer.settled();
    await expect.poll(() => explorer.dotCount()).toBeLessThan(before / 5);
    expect(await explorer.dotCount()).toBeGreaterThan(0);
  });
});

test.describe('focus (chip) filters', () => {
  test('a trust chip cuts the dots to the trust, shows in the address, and clears again', async ({ explorer, page }) => {
    const trust = aTrust('secondary');
    await explorer.open();
    const before = await explorer.dotCount();

    // Reached the way a visitor would: from a school's popup
    await explorer.open(`urn=${trust.schools[0].urn}`);
    await explorer.detailsLoaded();
    await explorer.popup.getByRole('button', { name: /^See all \d+ schools in this trust$/ }).click();

    const chip = page.locator('#focus').getByRole('button', { name: 'Clear trust filter' });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/^Trust: /);
    await expect.poll(() => explorer.query().get('trust')).toBe(trust.id);
    await expect.poll(() => explorer.dotCount()).toBeLessThanOrEqual(trust.schools.length);
    expect(await explorer.dotCount()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#focus')).toContainText('Schools on this map');

    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect.poll(() => explorer.query().has('trust')).toBe(false);
    expect(await explorer.dotCount()).toBe(before);
  });
});

test.describe('the list of schools in view', () => {
  test('lists the top schools for the mode, and Enter on one opens its popup', async ({ explorer, page }) => {
    await explorer.open();
    const items = page.locator('#school-list li');
    await expect(items).toHaveCount(30);
    await expect(page.locator('#list-caption')).toContainText(/in view, top 30 shown/);
    await items.first().focus();
    await page.keyboard.press('Enter');
    await expect(explorer.popup).toBeVisible();
    await expect.poll(() => explorer.query().has('urn')).toBe(true);
  });
});
