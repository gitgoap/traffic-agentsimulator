import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { presets } from '../src/simulation/presets';

const pageErrors = new WeakMap<Page, string[]>();
const roadPixels = (page: Page) =>
  page.locator('canvas').evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] >= 45 &&
        data[i] <= 110 &&
        data[i + 1] >= 65 &&
        data[i + 1] <= 125 &&
        data[i + 2] >= 65 &&
        data[i + 2] <= 125
      )
        count++;
    }
    return count;
  });
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play simulation', exact: true })).toBeEnabled();
  await expect.poll(() => roadPixels(page)).toBeGreaterThan(100);
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('steps, runs, pauses, resets, and preserves vehicle count without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByTestId('active-vehicles')).toContainText('36');
  await page.getByRole('button', { name: 'Step simulation', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0.1');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByRole('progressbar').getAttribute('value')))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play simulation', exact: true })).toBeVisible();
  const time = await page.getByRole('progressbar').getAttribute('value');
  await page.waitForTimeout(300);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', time!);
  await page.getByRole('button', { name: 'Brake one car', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('braked');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  expect(errors).toEqual([]);
});

test('signal control holds traffic, and the flyover is a distinct runnable network', async ({
  page,
}) => {
  await page.getByRole('button', { name: '02 Crossroads' }).click();
  await expect.poll(() => roadPixels(page)).toBeGreaterThan(100);
  await page.getByLabel('Hold all signals red').check();
  await page.getByLabel('Playback speed', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByRole('progressbar').getAttribute('value')), {
      timeout: 15000,
    })
    .toBeGreaterThan(35);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(
    page.getByText('Completed trips', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('0');
  await expect(
    page.getByText('Slow / stopped', { exact: true }).locator('..').locator('dd'),
  ).not.toHaveText('0');
  await page.getByRole('button', { name: '03 Flyover' }).click();
  await expect(page.getByRole('heading', { name: 'Over, under, and merging' })).toBeVisible();
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect
    .poll(async () => parseFloat((await page.getByTestId('active-vehicles').textContent()) ?? ''))
    .toBeGreaterThan(0);
});

test('edits roads and nodes, and rejects invalid geometry without breaking the run', async ({
  page,
}) => {
  await page.getByRole('button', { name: '02 Crossroads' }).click();
  await page.getByRole('button', { name: 'Edit network', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play simulation', exact: true })).toBeDisabled();
  await page.getByLabel('Lanes per direction', { exact: true }).focus();
  await page.getByLabel('Lanes per direction', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Lanes per direction', { exact: true })).toHaveValue('2');
  await page.getByLabel('Node X', { exact: true }).fill('-20');
  await page.getByRole('button', { name: 'Apply node', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('at least 65');
  await page.getByLabel('Node X', { exact: true }).fill('-320');
  await page.getByRole('button', { name: 'Apply node', exact: true }).click();
  await expect(page.getByLabel('Node X', { exact: true })).toHaveValue('-320');
  await page.getByRole('button', { name: 'Place a junction on map', exact: true }).click();
  const canvas = page.getByRole('img', { name: /Interactive traffic network/ });
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  await canvas.click({ position: { x: rect!.width * 0.72, y: rect!.height * 0.72 } });
  await expect(page.getByLabel('Selected node', { exact: true }).locator('option')).toHaveCount(6);
  await page.getByLabel('New road from', { exact: true }).selectOption('west');
  await page.getByLabel('New road to', { exact: true }).selectOption('node1');
  await page.getByRole('button', { name: 'Connect with one-way road', exact: true }).click();
  await expect(page.getByLabel('Selected road', { exact: true }).locator('option')).toHaveCount(9);
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play simulation', exact: true })).toBeEnabled();
});

test('saves locally, loads, imports, and exports scenarios', async ({ page }) => {
  await page.getByRole('button', { name: 'Save scenario locally', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved in this browser' })).toBeVisible();
  await page.getByRole('button', { name: '03 Flyover' }).click();
  await page.getByRole('button', { name: /^The phantom traffic jam/ }).click();
  await expect(page.getByRole('heading', { name: 'The phantom traffic jam' })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export scenario', exact: true }).click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe('traffic-lab-scenario.json');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toContainText('Invalid');
  await page.locator('input[type=file]').setInputFiles({
    name: 'network.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(presets.flyover)),
  });
  await expect(page.getByRole('heading', { name: 'Over, under, and merging' })).toBeVisible();
});

test('shares publicly, retains private edits, and deletes the shared copy', async ({
  page,
  browser,
  request,
}) => {
  await page.getByRole('button', { name: 'Share scenario', exact: true }).click();
  await expect(page.getByLabel('Shared scenario link', { exact: true })).toBeVisible();
  const link = await page.getByLabel('Shared scenario link', { exact: true }).inputValue();
  const id = new URL(link).searchParams.get('scenario')!;
  const context = await browser.newContext();
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(viewer.getByRole('heading', { name: 'The phantom traffic jam' })).toBeVisible();
  await expect(viewer.getByText(/Saved run at/)).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Share scenario', exact: true })).toBeVisible();
  expect((await request.delete(`/api/scenarios/${id}`)).status()).toBe(403);
  await page.getByLabel('Duration', { exact: true }).fill('');
  await page.getByLabel('Duration', { exact: true }).pressSequentially('60');
  const updating = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes(`/api/scenarios/${id}`),
  );
  await page.getByRole('button', { name: 'Update share', exact: true }).click();
  expect((await updating).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Saved on this development server');
  const stored = await request.get(`/api/scenarios/${id}`);
  const data = await stored.json();
  expect(data.scenario.duration).toBe(60);
  expect(data.revision).toBe(2);
  expect(data.tokenHash).toBeUndefined();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete shared scenario', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Shared copy deleted');
  expect((await request.get(`/api/scenarios/${id}`)).status()).toBe(404);
  await context.close();
});

test('runs paired experiments and exports metrics', async ({ page }) => {
  await page.getByLabel('Duration', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Use current as baseline', exact: true }).click();
  await page.getByLabel('Desired speed', { exact: true }).focus();
  await page.getByLabel('Desired speed', { exact: true }).press('ArrowLeft');
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('table')).toContainText('Final mean speed');
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download comparison CSV/ }).click();
  expect((await csv).suggestedFilename()).toBe('traffic-lab-comparison.csv');
});

test('has accessible controls, keyboard field notes, and no horizontal overflow', async ({
  page,
}) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const size = page.viewportSize()!;
  await page.setViewportSize({ ...size, width: size.width - 20 });
  await expect.poll(() => roadPixels(page)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Explore the model', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
