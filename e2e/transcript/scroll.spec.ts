import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});

const scroller = (page: Page) => page.locator('[data-virtuoso-scroller]');
const gap = (page: Page) => scroller(page).evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop);
async function settle(page: Page) {
  // Virtuoso measures rows and applies scroll corrections over several frames.
  await page.waitForTimeout(350);
}
async function anchor(page: Page) {
  return scroller(page).evaluate(node => {
    const top = node.getBoundingClientRect().top;
    const row = [...node.querySelectorAll<HTMLElement>('[data-index]')]
      .find(row => row.getBoundingClientRect().bottom > top);
    return { text: row?.textContent, offset: top - (row?.getBoundingClientRect().top ?? 0) };
  });
}
async function expectAnchor(page: Page, expected: Awaited<ReturnType<typeof anchor>>) {
  await expect.poll(async () => (await anchor(page)).text).toBe(expected.text);
  await expect.poll(async () => Math.abs((await anchor(page)).offset - expected.offset)).toBeLessThan(2);
}
async function readHistory(page: Page) {
  await scroller(page).hover();
  await page.mouse.wheel(0, -900);
  await settle(page);
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
  await page.goto('/e2e/transcript/index.html');
  await expect(page).toHaveTitle('Transcript regression fixture');
  await expect(scroller(page)).toBeVisible();
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await settle(page);
});

test('near-bottom return resumes latest and follows incoming messages', async ({ page }) => {
  await scroller(page).evaluate(node => { node.scrollTop -= 10; });
  await settle(page);
  await page.getByRole('button', { name: 'Switch tab', exact: true }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Switch tab', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
});

test('intentional scroll-up keeps the visible row through incoming messages and tab return', async ({ page }) => {
  await readHistory(page);
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await page.getByRole('button', { name: 'Switch tab', exact: true }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Switch tab', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await page.screenshot({ path: '/tmp/pulsete-transcript-history.png' });
});

test('older prepend preserves the visible row and exact offset', async ({ page }) => {
  await readHistory(page);
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
});

test('bounded older and newer windows preserve a shared visible row', async ({ page }) => {
  await page.getByRole('button', { name: 'Bounded: false', exact: true }).click();
  await page.getByRole('button', { name: 'Jump', exact: true }).click();
  await settle(page);
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await page.getByRole('button', { name: 'Newer', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
});

test('message jump stays put on incoming output and latest resumes following', async ({ page }) => {
  await page.getByRole('button', { name: 'Jump', exact: true }).click();
  await settle(page);
  await expect(page.getByText(/^Message 200:/)).toBeInViewport();
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await page.getByRole('button', { name: 'Latest', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await settle(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
});

test('PageUp stops following, and reaching the top intentionally loads older history', async ({ page }) => {
  await scroller(page).focus();
  await page.keyboard.press('PageUp');
  await settle(page);
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await scroller(page).hover();
  await page.mouse.wheel(0, -30000);
  await expect(page.locator('output')).toHaveText('Tab a; older 1; newer 0');
});

test('reaching the end of older history loads newer messages', async ({ page }) => {
  await page.getByRole('button', { name: 'Bounded: false', exact: true }).click();
  await page.getByRole('button', { name: 'Jump', exact: true }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await settle(page);
  await scroller(page).hover();
  await expect.poll(async () => {
    await page.mouse.wheel(0, 1200);
    return page.locator('output').textContent();
  }).toBe('Tab a; older 1; newer 1');
});


test('opening an unread channel renders its unread message and preserves the previous channel anchor', async ({ page }) => {
  await readHistory(page);
  const saved = await anchor(page);
  await page.getByRole('button', { name: 'Unread channel', exact: true }).click();
  await expect(scroller(page)).toBeVisible();
  await expect(page.getByText(/^Message 200:/)).toBeInViewport();
  await page.getByRole('button', { name: 'Switch tab', exact: true }).click();
  await expectAnchor(page, saved);
});

test('an empty channel positions at its unread message when history arrives', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty channel', exact: true }).click();
  await expect(page.getByText('Empty', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish loading', exact: true }).click();
  await expect(scroller(page)).toBeVisible();
  await expect(page.getByText(/^Message 200:/)).toBeInViewport();
  await page.screenshot({ path: '/tmp/pulsete-channel-investigation/history-loaded.png' });
});


async function growRenderedRow(page: Page, aboveViewport = false) {
  await scroller(page).evaluate((node, above) => {
    const rows = [...node.querySelectorAll<HTMLElement>('[data-index]')];
    const row = above
      ? rows.find(row => row.getBoundingClientRect().bottom <= node.getBoundingClientRect().top)
      : rows.at(-1);
    if (!row) throw new Error('No row available to resize');
    row.style.paddingBottom = '180px';
  }, aboveViewport);
}

test('any row growth follows latest without a media-specific callback', async ({ page }) => {
  await growRenderedRow(page);
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await settle(page);
  await expect.poll(() => gap(page)).toBeLessThan(2);
});

test('row growth above the reading position preserves the visible message and offset', async ({ page }) => {
  await readHistory(page);
  const saved = await anchor(page);
  await growRenderedRow(page, true);
  await settle(page);
  await expectAnchor(page, saved);
});

test('resizing the transcript preserves reading intent and latest intent', async ({ page }) => {
  await readHistory(page);
  const saved = await anchor(page);
  await page.locator('section').evaluate(node => { node.style.height = '450px'; });
  await settle(page);
  await expectAnchor(page, saved);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await settle(page);
  await expectAnchor(page, saved);
  await page.getByRole('button', { name: 'Latest', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await page.locator('section').evaluate(node => { node.style.height = '350px'; });
  await expect.poll(() => gap(page)).toBeLessThan(2);
});

test('a small scroll up and back down resumes following', async ({ page }) => {
  await scroller(page).hover();
  await page.mouse.wheel(0, -10);
  await expect.poll(() => gap(page)).toBeGreaterThan(0);
  await settle(page);
  await page.mouse.wheel(0, 10);
  await expect.poll(() => gap(page)).toBeLessThan(2);
  await settle(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect.poll(() => gap(page)).toBeLessThan(2);
});

for (const input of ['wheel', 'keyboard'] as const) {
  test(`downward ${input} at an existing history boundary loads newer messages`, async ({ page }) => {
    await page.getByRole('button', { name: 'Bounded: false', exact: true }).click();
    await page.getByRole('button', { name: 'Older', exact: true }).click();
    await settle(page);
    await expect.poll(() => gap(page)).toBeLessThan(2);
    await expect(page.locator('output')).toHaveText('Tab a; older 1; newer 0');
    if (input === 'wheel') {
      await scroller(page).hover();
      await page.mouse.wheel(0, 1000);
    } else {
      await scroller(page).focus();
      await page.keyboard.press('End');
    }
    await expect(page.locator('output')).toHaveText('Tab a; older 1; newer 1');
  });
}
