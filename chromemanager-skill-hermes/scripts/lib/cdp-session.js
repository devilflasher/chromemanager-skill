import { chromium } from 'playwright';

function scorePage(page) {
  const url = page.url() || '';
  if (!url) {
    return -100;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 100;
  }
  if (url.startsWith('about:blank')) {
    return 10;
  }
  if (url.startsWith('chrome://') || url.startsWith('devtools://')) {
    return -50;
  }
  return 20;
}

function selectBestPage(context) {
  const pages = context.pages().filter(page => !page.isClosed());
  if (pages.length === 0) {
    return null;
  }

  return [...pages].sort((a, b) => scorePage(b) - scorePage(a))[0];
}

export async function attachToWindow(windowInfo) {
  if (!windowInfo.debugPort) {
    throw new Error(`Window ${windowInfo.number} has no debugPort`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${windowInfo.debugPort}`);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error(`No browser context on debugPort ${windowInfo.debugPort}`);
  }

  let page = selectBestPage(context);
  if (!page) {
    page = await context.newPage();
  }

  return { browser, context, page };
}

export async function withWindowPage(windowInfo, handler) {
  const session = await attachToWindow(windowInfo);
  try {
    return await handler(session);
  } finally {
    await session.browser.close().catch(() => {});
  }
}
