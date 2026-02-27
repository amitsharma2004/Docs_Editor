/**
 * TASK-009-3: E2E Tests — Collaborative Editing
 *
 * Tests the full Google Docs Clone workflow from the browser perspective
 * using two isolated browser contexts (User A and User B).
 *
 * Prerequisites (must be running before executing these tests):
 *   - Server:  cd server && npm run dev   (port 5000)
 *   - Client:  cd client && npm run dev   (port 3000)
 *   - MongoDB and Redis accessible
 *
 * Run:
 *   npx playwright test --config=playwright.config.ts
 *
 * Scenarios:
 *   1. User A registers and creates a document
 *   2. User B registers and navigates to the same document
 *   3. User A types → User B sees the text appear (real-time sync)
 *   4. User B types → User A sees the text appear (bidirectional)
 *   5. Concurrent typing → both users converge to the same document state
 *   6. Page title is editable and persists
 *   7. Document dashboard shows created documents
 *   8. Delete document removes it from dashboard
 */

import { test, expect, Browser, BrowserContext, Page, chromium } from '@playwright/test';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000';
const EDITOR_SELECTOR = '.ql-editor';
const SAVE_STATUS_SELECTOR = '[data-testid="save-status"], header span';

/** Create a unique email per test run to avoid conflicts. */
const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}@e2e-test.com`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Register a new user account via the UI. */
async function registerUser(
  page: Page,
  name: string,
  email: string,
  password = 'password123'
): Promise<void> {
  await page.goto(`${BASE_URL}/register`);
  await page.waitForSelector('input[placeholder="Full name"]');
  await page.fill('input[placeholder="Full name"]', name);
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder*="Password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
}

/** Login an existing user via the UI. */
async function loginUser(
  page: Page,
  email: string,
  password = 'password123'
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
}

/** Create a new document from the dashboard and return its URL. */
async function createDocument(page: Page): Promise<string> {
  await page.goto(BASE_URL);
  // Click the "+" new document card
  await page.click('[style*="cursor: pointer"][style*="1a73e8"], [role="button"]');
  // Wait for redirect to editor
  await page.waitForURL(/\/document\//, { timeout: 10_000 });
  return page.url();
}

/** Wait for the Quill editor to be ready and return its content. */
async function getEditorText(page: Page): Promise<string> {
  await page.waitForSelector(EDITOR_SELECTOR, { timeout: 10_000 });
  return page.locator(EDITOR_SELECTOR).innerText();
}

/** Type text into the Quill editor. */
async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(EDITOR_SELECTOR);
  await editor.click();
  await editor.type(text, { delay: 50 });
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

let browser: Browser;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

test.afterAll(async () => {
  await browser.close();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Authentication Flow', () => {
  test('user can register and land on dashboard', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      const email = uniqueEmail('reg');
      await registerUser(page, 'E2E User', email);

      // Should be on the dashboard
      await expect(page).toHaveURL(`${BASE_URL}/`);
      // Dashboard heading should be visible
      await expect(page.locator('text=Docs')).toBeVisible({ timeout: 5000 });
    } finally {
      await ctx.close();
    }
  });

  test('user can login with valid credentials', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      const email = uniqueEmail('login');
      // Register first
      await registerUser(page, 'Login User', email);
      // Sign out
      await page.click('button:has-text("Sign out")');
      // Login again
      await loginUser(page, email);
      await expect(page).toHaveURL(`${BASE_URL}/`);
    } finally {
      await ctx.close();
    }
  });

  test('invalid credentials show error message', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', 'nonexistent@test.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Error message should appear
      await expect(page.locator('[style*="fce8e6"]')).toBeVisible({ timeout: 5000 });
    } finally {
      await ctx.close();
    }
  });

  test('unauthenticated access to / redirects to /login', async () => {
    const ctx = await browser.newContext(); // fresh context, no stored token
    const page = await ctx.newPage();

    try {
      await page.goto(BASE_URL);
      await page.waitForURL(/\/login/, { timeout: 8000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Document Dashboard', () => {
  let ctxA: BrowserContext;
  let pageA: Page;
  let emailA: string;

  test.beforeEach(async () => {
    emailA = uniqueEmail('dash');
    ctxA = await browser.newContext();
    pageA = await ctxA.newPage();
    await registerUser(pageA, 'Dash User', emailA);
  });

  test.afterEach(async () => {
    await ctxA.close();
  });

  test('create a new document → appears in dashboard', async () => {
    await createDocument(pageA);
    await pageA.goto(BASE_URL);

    // Dashboard should list the new document
    await expect(pageA.locator('text=Untitled Document')).toBeVisible({ timeout: 8000 });
  });

  test('document title is editable in the editor', async () => {
    const docUrl = await createDocument(pageA);
    await pageA.goto(docUrl);

    // Click on the title to edit
    const titleEl = pageA.locator('span[style*="cursor: pointer"][style*="fontWeight"]').first();
    await titleEl.click();

    const titleInput = pageA.locator('input[style*="fontSize"]');
    await titleInput.waitFor({ timeout: 5000 });
    await titleInput.fill('My Renamed Doc');
    await titleInput.press('Enter');

    // Wait for title to update
    await expect(pageA.locator('text=My Renamed Doc')).toBeVisible({ timeout: 5000 });
  });

  test('delete document removes it from dashboard', async () => {
    await createDocument(pageA);
    await pageA.goto(BASE_URL);

    // Click the delete button (🗑) on the first document
    const deleteBtn = pageA.locator('button:has-text("🗑")').first();
    await deleteBtn.waitFor({ timeout: 5000 });

    // Intercept the confirm dialog
    pageA.once('dialog', (dialog) => dialog.accept());
    await deleteBtn.click();

    // Document should disappear
    await expect(pageA.locator('text=Untitled Document')).toBeHidden({ timeout: 5000 });
  });
});

test.describe('Real-Time Collaborative Editing', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let docUrl: string;
  let emailA: string;
  let emailB: string;

  test.beforeEach(async () => {
    // Register two separate users in isolated browser contexts
    emailA = uniqueEmail('collab-a');
    emailB = uniqueEmail('collab-b');

    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();

    // Register User A and create the shared document
    await registerUser(pageA, 'Collab A', emailA);
    docUrl = await createDocument(pageA);

    // Register User B — they'll navigate to the same doc URL
    await registerUser(pageB, 'Collab B', emailB);
  });

  test.afterEach(async () => {
    await ctxA.close();
    await ctxB.close();
  });

  test('User A types → User B sees the text in real time', async () => {
    // User A is already in the editor; User B opens the same doc
    await pageB.goto(docUrl);
    await pageB.waitForSelector(EDITOR_SELECTOR, { timeout: 10_000 });

    // User A types into the editor
    await typeInEditor(pageA, 'Hello from A');

    // User B should see "Hello from A" appear within 5 seconds
    await expect(async () => {
      const text = await getEditorText(pageB);
      expect(text).toContain('Hello from A');
    }).toPass({ timeout: 8000, intervals: [500] });
  });

  test('User B types → User A sees the text in real time', async () => {
    await pageB.goto(docUrl);
    await pageB.waitForSelector(EDITOR_SELECTOR, { timeout: 10_000 });

    await typeInEditor(pageB, 'Hello from B');

    await expect(async () => {
      const text = await getEditorText(pageA);
      expect(text).toContain('Hello from B');
    }).toPass({ timeout: 8000, intervals: [500] });
  });

  test('concurrent typing — both users converge to the same document state', async () => {
    await pageB.goto(docUrl);
    await pageB.waitForSelector(EDITOR_SELECTOR, { timeout: 10_000 });

    // Both users type simultaneously
    await Promise.all([
      typeInEditor(pageA, 'TextA'),
      typeInEditor(pageB, 'TextB'),
    ]);

    // Wait for ops to propagate and converge
    await new Promise((r) => setTimeout(r, 3000));

    const textA = await getEditorText(pageA);
    const textB = await getEditorText(pageB);

    // Both editors must contain all inserted text (order may differ)
    expect(textA.replace(/\s/g, '')).toContain('TextA');
    expect(textA.replace(/\s/g, '')).toContain('TextB');

    // Both users must see the SAME final state (convergence)
    expect(textA.replace(/\s/g, '')).toBe(textB.replace(/\s/g, ''));
  });

  test('presence avatars show collaborators in the editor header', async () => {
    await pageB.goto(docUrl);
    await pageB.waitForSelector(EDITOR_SELECTOR, { timeout: 10_000 });

    // Wait for presence to sync
    await new Promise((r) => setTimeout(r, 1500));

    // User A should see an avatar for User B (first letter of their email)
    // Avatars are rendered as circular divs with first char of user name
    const avatarLocator = pageA.locator('[style*="border-radius: 50%"][style*="background"]');
    await expect(avatarLocator).toBeVisible({ timeout: 5000 });
  });

  test('connection indicator shows "connected" (green dot) on load', async () => {
    // The connection dot uses background: #188038 (green) when connected
    const connDot = pageA.locator('[style*="border-radius: 50%"][title="connected"]');
    await expect(connDot).toBeVisible({ timeout: 8000 });
  });
});
