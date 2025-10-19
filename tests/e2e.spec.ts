import { test, expect, Page } from '@playwright/test';

function urlFor(path: string, testId: string) {
  const qp = `?testId=${encodeURIComponent(testId)}`;
  if (path.startsWith('/')) return `${path}${qp}`;
  return `/${path}${qp}`;
}

async function clearDb(page: Page, testId: string) {
  await page.goto('about:blank');
  await page.addInitScript(([id]) => {
    localStorage.removeItem(`rtodo-e2e-${id}`);
  }, [testId]);
}

async function dragItem(page: Page, sourceHandleSelector: string, targetItemSelector: string) {
  const source = page.locator(sourceHandleSelector).first();
  const target = page.locator(targetItemSelector).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  const sbox = await source.boundingBox();
  const tbox = await target.boundingBox();
  if (!sbox || !tbox) throw new Error('Could not get bounding boxes');

  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.mouse.down();
  // move to slightly above the target to reorder
  await page.mouse.move(tbox.x + 10, tbox.y + 5, { steps: 10 });
  await page.mouse.up();
}

function itemsInOrder(page: Page) {
  const items = page.locator('[data-testid="todo-item"]');
  return items.allTextContents().then((arr) => arr.map((t) => t.split('\n')[0].trim()));
}

test.describe('Todo E2E', () => {
  test('add task and update counts', async ({ page }) => {
    const testId = `add-${Date.now()}`;
    await clearDb(page, testId);
    await page.goto(urlFor('/', testId));

    const input = page.getByTestId('new-todo-input');
    await expect(input).toBeVisible();
    await input.fill('Buy milk');
    await input.press('Enter');

    const list = page.getByTestId('todo-list');
    await expect(list).toContainText('Buy milk');

    await expect(page.getByTestId('total-count')).toHaveText('1');
    await expect(page.getByTestId('active-count')).toHaveText('1');
    await expect(page.getByTestId('completed-count')).toHaveText('0');
  });

  test('complete and uncomplete updates stats', async ({ page }) => {
    const testId = `toggle-${Date.now()}`;
    await clearDb(page, testId);
    await page.goto(urlFor('/', testId));

    const input = page.getByTestId('new-todo-input');
    await input.fill('Task 1');
    await input.press('Enter');

    const item = page.locator('[data-testid="todo-item"]', { hasText: 'Task 1' });
    const toggle = item.getByTestId('todo-toggle');

    await toggle.click();
    await expect(page.getByTestId('active-count')).toHaveText('0');
    await expect(page.getByTestId('completed-count')).toHaveText('1');

    await toggle.click();
    await expect(page.getByTestId('active-count')).toHaveText('1');
    await expect(page.getByTestId('completed-count')).toHaveText('0');
  });

  test('drag-and-drop reorder persists after reload', async ({ page }) => {
    const testId = `dnd-${Date.now()}`;
    await clearDb(page, testId);
    await page.goto(urlFor('/', testId));

    const input = page.getByTestId('new-todo-input');
    await input.fill('Task A');
    await input.press('Enter');
    await input.fill('Task B');
    await input.press('Enter');
    await input.fill('Task C');
    await input.press('Enter');

    await expect(page.getByTestId('total-count')).toHaveText('3');

    await dragItem(
      page,
      '[data-testid="todo-item"]:has-text("Task B") [data-testid="todo-drag-handle"]',
      '[data-testid="todo-item"]:has-text("Task A")'
    );

    // Wait for order to change: assert first two
    await expect.poll(async () => (await itemsInOrder(page)).slice(0, 2).join('|')).toBe('Task B|Task A');

    await page.reload();
    const after = await itemsInOrder(page);
    expect(after[0]).toBe('Task B');
  });

  test('cross-window sync between main and compact views', async ({ browser }) => {
    const context = await browser.newContext();
    const testId = `sync-${Date.now()}`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(urlFor('/', testId));
    await page2.goto(urlFor('/compact', testId));

    const input = page1.getByTestId('new-todo-input');
    await input.fill('Sync Task');
    await input.press('Enter');

    await expect(page2.getByTestId('compact-first-text')).toHaveText('Sync Task');

    // complete from compact window
    await page2.locator('input[type="checkbox"]').click();

    await expect(page1.getByTestId('completed-count')).toHaveText('1');
  });
});
