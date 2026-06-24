import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const shots = [];

async function shot(page, name) {
  const path = `D:/ven/scripts/.verify-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
  console.log(`screenshot: ${path}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

  console.log('--- login ---');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await shot(page, '01-login');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill('admin@localhost');
  await passInput.fill('admin123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/.*\/(dashboard|contacts|pipeline)?$/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '02-after-login');
  console.log('url after login:', page.url());

  console.log('--- sidebar nav context menu ---');
  const navLink = page.locator('a[href="/contacts"]').first();
  await navLink.waitFor({ state: 'visible', timeout: 10000 });
  const box = await navLink.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(400);
  await shot(page, '03-sidebar-nav-contextmenu');
  const sidebarMenuText = await page.locator('text=Open in new tab').first().isVisible().catch(() => false);
  console.log('sidebar nav menu visible:', sidebarMenuText);
  await page.keyboard.press('Escape');

  console.log('--- messaging: channel sidebar context menu ---');
  await page.goto(`${BASE}/messaging`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '04-messaging');

  // create a channel if none exist, else use first channel row
  let channelRow = page.locator('button:has-text("#")').first();
  let hasChannel = await channelRow.isVisible().catch(() => false);
  if (!hasChannel) {
    console.log('no channel found, creating one');
    await page.locator('button[title="New channel"]').click();
    await page.locator('input[placeholder="e.g. general"]').fill('verify-ctx-menu');
    await page.locator('button:has-text("Create")').click();
    await page.waitForTimeout(1500);
    channelRow = page.locator('button:has-text("verify-ctx-menu")').first();
  }
  await channelRow.waitFor({ state: 'visible', timeout: 10000 });
  const cbox = await channelRow.boundingBox();
  await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2, { button: 'right' });
  await page.waitForTimeout(400);
  await shot(page, '05-channel-row-contextmenu');
  const renameVisible = await page.locator('text=Rename').first().isVisible().catch(() => false);
  const archiveVisible = await page.locator('text=Archive channel').first().isVisible().catch(() => false);
  console.log('channel row menu — Rename visible:', renameVisible, '| Archive visible:', archiveVisible);
  await page.keyboard.press('Escape');

  console.log('--- messaging: send + right-click a message bubble ---');
  await channelRow.click();
  await page.waitForTimeout(1000);
  const composer = page.locator('textarea, [contenteditable="true"]').first();
  await composer.click();
  await composer.fill('hello from verify script');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await shot(page, '06-message-sent');

  const bubble = page.locator('text=hello from verify script').first();
  await bubble.waitFor({ state: 'visible', timeout: 10000 });
  const bbox = await bubble.boundingBox();
  await page.mouse.click(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2, { button: 'right' });
  await page.waitForTimeout(400);
  await shot(page, '07-message-contextmenu');
  const copyTextVisible = await page.locator('text=Copy text').first().isVisible().catch(() => false);
  const deleteVisible = await page.locator('text=Delete').first().isVisible().catch(() => false);
  console.log('message menu — Copy text visible:', copyTextVisible, '| Delete visible:', deleteVisible);
  await page.keyboard.press('Escape');

  await browser.close();
  console.log('DONE. Screenshots:', shots.join(', '));
})().catch(err => { console.error('SCRIPT FAILED:', err); process.exit(1); });
