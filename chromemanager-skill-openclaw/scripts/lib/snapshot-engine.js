import fs from 'node:fs';
import path from 'node:path';

function snapshotPathFor(refsDir, windowNumber) {
  return path.join(refsDir, `window-${windowNumber}.json`);
}

export function loadSnapshot(refsDir, windowNumber) {
  const filePath = snapshotPathFor(refsDir, windowNumber);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function saveSnapshot(refsDir, windowNumber, snapshot) {
  const filePath = snapshotPathFor(refsDir, windowNumber);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filePath;
}

export async function captureSnapshot(page, options = {}) {
  const maxItems = Number(options.maxItems || 220);
  const includeTextBlocks = options.includeTextBlocks !== false;

  const snapshot = await page.evaluate(
    ({ maxItems: limit, includeTextBlocks: includeText }) => {
      const visible = element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      };

      const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

      const textOf = element => normalize(element.innerText || element.textContent || '');

      const xpathOf = element => {
        if (element.id) {
          return `//*[@id=${JSON.stringify(element.id)}]`;
        }

        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const name = current.nodeName.toLowerCase();
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.nodeName.toLowerCase() === name) {
              index++;
            }
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(`${name}[${index}]`);
          current = current.parentElement;
        }
        return `/${parts.join('/')}`;
      };

      const nearestContext = element => {
        const container = element.closest('section, article, form, dialog, [role="dialog"], nav, header, aside, main, li, tr, td');
        if (!container) {
          return '';
        }
        return normalize(container.innerText || '').slice(0, 240);
      };

      const candidates = new Set();
      const selectors = [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        'option',
        'label',
        'summary',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[aria-haspopup]',
        '[contenteditable="true"]'
      ];

      document.querySelectorAll(selectors.join(',')).forEach(element => candidates.add(element));

      if (includeText) {
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div').forEach(element => {
          const text = textOf(element);
          if (!text || text.length < 2 || text.length > 180) {
            return;
          }
          if (element.children.length > 6) {
            return;
          }
          if (!visible(element)) {
            return;
          }
          if (element.closest('button, a, label, [role="button"], [role="link"]')) {
            return;
          }
          candidates.add(element);
        });
      }

      const items = [];
      let index = 1;
      for (const element of candidates) {
        if (items.length >= limit) {
          break;
        }
        if (!visible(element)) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        const text = textOf(element);
        const placeholder = normalize(element.getAttribute('placeholder'));
        const ariaLabel = normalize(element.getAttribute('aria-label'));
        const title = normalize(element.getAttribute('title'));
        const role = normalize(element.getAttribute('role'));
        const href = element.getAttribute('href') || '';
        const type = element.getAttribute('type') || '';
        const value = 'value' in element ? normalize(element.value) : '';
        const interactive =
          ['button', 'a', 'input', 'textarea', 'select', 'option', 'label', 'summary'].includes(tag) ||
          ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch'].includes(role) ||
          element.hasAttribute('aria-haspopup') ||
          element.getAttribute('contenteditable') === 'true';

        items.push({
          ref: `e${index++}`,
          tag,
          role,
          type,
          text,
          placeholder,
          ariaLabel,
          title,
          href,
          value,
          disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
          checked: Boolean(element.checked || element.getAttribute('aria-checked') === 'true'),
          selected: Boolean(element.selected || element.getAttribute('aria-selected') === 'true'),
          interactive,
          contextText: nearestContext(element),
          xpath: xpathOf(element),
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }

      const [width, height] = [window.innerWidth, window.innerHeight];

      return {
        url: location.href,
        title: document.title || '',
        capturedAt: new Date().toISOString(),
        viewport: { width, height },
        itemCount: items.length,
        items
      };
    },
    { maxItems, includeTextBlocks }
  );

  snapshot.snapshotId = `snapshot-${Date.now()}`;
  return snapshot;
}
