// Keyboard use. The popup is redrawn when its lazy details arrive; focus must survive that (regression for ff505a7).
import { comparableSecondary } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

const [school] = comparableSecondary();

test('focus stays on the popup button when the details arrive and redraw it', async ({ explorer, page }) => {
  const release = await explorer.holdDetails();
  await explorer.open();
  await explorer.clickDot(school);
  await expect(explorer.popup.locator('.loading-note')).toBeVisible();

  const button = explorer.popup.getByRole('button', { name: 'Add to shortlist' });
  await button.focus();
  await expect(button).toBeFocused();

  release();
  await explorer.detailsLoaded();
  // The popup was rebuilt, so this is a new element: it must still be the one with focus
  await expect(explorer.popup.getByRole('button', { name: 'Add to shortlist' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(explorer.popup.getByRole('button', { name: 'Remove from shortlist' })).toBeFocused();
});

test('search results can be chosen with the arrow keys and Enter', async ({ explorer, page }) => {
  await explorer.open();
  const search = page.getByRole('searchbox', { name: 'Search for a school or postcode' });
  await search.fill(school.name);
  await expect(page.locator('#search-results li').first()).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(explorer.popup).toBeVisible();
  await expect(explorer.popup).toContainText(school.name);
});

test('the shortlist comparison opens and closes from the keyboard, returning focus', async ({ explorer, page }) => {
  await explorer.open();
  await explorer.shortlistSchools(comparableSecondary().slice(0, 2));
  const compare = explorer.shortlist.getByRole('button', { name: 'Compare' });
  await compare.focus();
  await page.keyboard.press('Enter');
  await expect(explorer.comparison).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(explorer.comparison).toBeHidden();
  await expect(compare).toBeFocused();
});
