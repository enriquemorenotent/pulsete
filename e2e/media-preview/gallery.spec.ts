import { expect, test, type Page } from '@playwright/test';

const historyPath = '**/api/buffers/*/history?*';
const imageUrl = (name: string) => `https://example.test/${name}.png`;
const message = (id: string, body: string) => ({ id, body });
const previewButton = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`Inline image preview.*${name}`) });

async function openGallery(page: Page) {
  await page.goto('/e2e/media-preview/index.html');
  await expect(page).toHaveTitle('Media preview regression fixture');
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Media shared with Reader' })).toBeVisible();
  return page.getByRole('region', { name: 'Shared media' });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/media/resource?*', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="310" height="250"><rect width="100%" height="100%" fill="#527b9a"/></svg>',
  }));
});

test('PM media scrolls to older items, skips text pages, and retries without losing items', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests: (string | null)[] = [];
  const recent = Array.from({ length: 18 }, (_, i) => message(`recent-${i}`, imageUrl(`recent-${i}`)));
  let retries = 0;
  await page.route(historyPath, route => {
    const before = new URL(route.request().url()).searchParams.get('before');
    requests.push(before);
    if (before === null) return route.fulfill({ json: { messages: recent, hasMore: true } });
    if (before === 'recent-0') {
      return route.fulfill({ json: { messages: [message('text-gap', 'Just a message')], hasMore: true } });
    }
    if (retries++ === 0) return route.fulfill({ status: 503, json: { message: 'Try again' } });
    return route.fulfill({ json: {
      messages: [message('oldest', imageUrl('oldest-picture')), message('duplicate', imageUrl('recent-17'))],
      hasMore: false,
    } });
  });
  const region = await openGallery(page);
  await expect(previewButton(page, 'recent-17')).toBeVisible();
  await expect.poll(() => region.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(requests).toEqual([null]);
  await region.press('End');
  await expect(region.getByRole('alert')).toHaveText('Couldn’t load media.');
  expect(requests).toEqual([null, 'recent-0', 'text-gap']);
  await expect(previewButton(page, 'recent-17')).toBeAttached();
  await region.getByRole('button', { name: 'Retry' }).click();
  await expect(region.getByRole('status')).toHaveText('No more media.');
  expect(requests).toEqual([null, 'recent-0', 'text-gap', 'text-gap']);
  const labels = await region.getByRole('button', { name: /Inline image preview/ }).evaluateAll(
    buttons => buttons.map(button => button.getAttribute('aria-label')),
  );
  expect(labels).toEqual([...recent].reverse().map(entry => expect.stringContaining(entry.id))
    .concat(expect.stringContaining('oldest-picture')));
  await expect(page.getByRole('button', { name: 'Load older messages' })).toHaveCount(0);
  await region.press('End');
  await expect(region.getByRole('status')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('pm-gallery-scroll.png') });
  await previewButton(page, 'oldest-picture').click();
  await expect(page.getByRole('dialog', { name: /oldest-picture/ })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an empty gallery keeps looking until all history and page previews are checked', async ({ page }) => {
  const history: (string | null)[] = [];
  let resolvePreview!: () => void;
  const previewGate = new Promise<void>(resolve => { resolvePreview = resolve; });
  await page.route('**/api/media/page-preview', async route => {
    await previewGate;
    await route.fulfill({ json: { preview: null } });
  });
  await page.route(historyPath, route => {
    const before = new URL(route.request().url()).searchParams.get('before');
    history.push(before);
    const messages = before === null ? [message('text', 'Just a message')]
      : before === 'text' ? [message('preview', 'https://imgur.com/gallery/media-example')]
      : [];
    return route.fulfill({ json: { messages, hasMore: messages.length > 0 } });
  });
  const previewStarted = page.waitForRequest(request => request.url().endsWith('/api/media/page-preview'));
  const region = await openGallery(page);
  await previewStarted;
  await expect(region.getByRole('status')).toHaveText('Loading media…');
  expect(history).toEqual([null, 'text']);
  resolvePreview();
  await expect(region.getByRole('status')).toHaveText('No media shared yet.');
  expect(history).toEqual([null, 'text', 'preview']);
});

test('closing or switching a gallery discards old history and pending previews', async ({ page }) => {
  let visits = 0;
  let finishHistory!: () => void;
  const historyGate = new Promise<void>(resolve => { finishHistory = resolve; });
  let finishPreview!: () => void;
  const previewGate = new Promise<void>(resolve => { finishPreview = resolve; });
  await page.route('**/api/media/page-preview', async route => {
    await previewGate;
    await route.fulfill({ json: { preview: { title: 'Old preview', imageUrl: imageUrl('old-preview') } } });
  });
  await page.route(historyPath, async route => {
    if (route.request().url().includes('/Other/')) {
      await route.fulfill({ json: { messages: [], hasMore: false } });
      return;
    }
    if (++visits === 1) {
      await historyGate;
      await route.fulfill({ json: { messages: [message('closed', imageUrl('closed-history'))], hasMore: false } });
      return;
    }
    await route.fulfill({ json: {
      messages: [message('preview', 'https://imgur.com/gallery/previous-chat')],
      hasMore: false,
    } });
  });

  const historyStarted = page.waitForRequest(request => request.url().includes('/Reader/history?'));
  await openGallery(page);
  await historyStarted;
  const aborted = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/Reader/history?') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED');
  finishHistory();
  const previewStarted = page.waitForRequest(request => request.url().endsWith('/api/media/page-preview'));
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await previewStarted;
  await page.getByText('Switch conversation', { exact: true }).evaluate(button => (button as HTMLElement).click());
  const next = page.getByRole('dialog', { name: 'Media shared with Other' });
  await expect(next.getByRole('status')).toHaveText('No media shared yet.');
  const previewFinished = page.waitForResponse(response => response.url().endsWith('/api/media/page-preview'));
  finishPreview();
  await previewFinished;
  await expect(next.getByRole('button', { name: /Inline image preview/ })).toHaveCount(0);
});
