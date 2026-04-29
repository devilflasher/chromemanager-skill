function includesAny(text, fragments) {
  const normalized = String(text || '').toLowerCase();
  return fragments.some(fragment => normalized.includes(String(fragment).toLowerCase()));
}

export async function inspectStage(page) {
  const title = await page.title().catch(() => '');
  const url = page.url() || '';
  const bodyText = await page.locator('body').innerText().catch(() => '');

  const challengeDetected = includesAny(`${title}\n${bodyText}`, [
    'cloudflare',
    'verify you are human',
    'checking your browser',
    'attention required',
    'turnstile'
  ]);

  const crashDetected = includesAny(`${title}\n${bodyText}`, [
    'aw, snap',
    'this site can’t be reached',
    'this site can\'t be reached',
    'err_',
    'status_breakpoint'
  ]);

  return {
    url,
    title,
    challengeDetected,
    crashDetected,
    bodyPreview: bodyText.slice(0, 2000)
  };
}

export function matchesStage(stage, expectations = {}) {
  if (expectations.expectedUrl && !stage.url.startsWith(expectations.expectedUrl)) {
    return { ok: false, reason: `URL mismatch: ${stage.url}` };
  }

  if (expectations.expectedUrlPrefix && !stage.url.startsWith(expectations.expectedUrlPrefix)) {
    return { ok: false, reason: `URL prefix mismatch: ${stage.url}` };
  }

  if (stage.challengeDetected) {
    return { ok: false, reason: 'Challenge page detected' };
  }

  if (stage.crashDetected) {
    return { ok: false, reason: 'Crash page detected' };
  }

  if (expectations.textHints?.length) {
    const found = expectations.textHints.some(hint =>
      stage.bodyPreview.toLowerCase().includes(String(hint).toLowerCase())
    );
    if (!found) {
      return { ok: false, reason: 'Expected text hints not found' };
    }
  }

  return { ok: true, reason: 'Stage validation passed' };
}
