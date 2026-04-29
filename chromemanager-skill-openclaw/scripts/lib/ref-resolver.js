function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function scoreText(haystack, needle, exactWeight, containsWeight) {
  if (!haystack || !needle) {
    return 0;
  }
  if (haystack === needle) {
    return exactWeight;
  }
  if (haystack.includes(needle)) {
    return containsWeight;
  }
  return 0;
}

function scoreItem(item, query) {
  let score = 0;
  const hint = normalize(query.hint);
  const text = normalize(query.text);
  const role = normalize(query.role);
  const containerHint = normalize(query.containerHint);

  if (query.ref && item.ref === query.ref) {
    return 10000;
  }

  score += scoreText(normalize(item.text), hint, 200, 100);
  score += scoreText(normalize(item.placeholder), hint, 170, 90);
  score += scoreText(normalize(item.ariaLabel), hint, 190, 95);
  score += scoreText(normalize(item.title), hint, 150, 80);
  score += scoreText(normalize(item.text), text, 200, 100);

  if (role && normalize(item.role) === role) {
    score += 120;
  }

  if (containerHint) {
    score += scoreText(normalize(item.contextText), containerHint, 120, 70);
  }

  if (item.interactive) {
    score += 25;
  }

  if (query.preferInteractive && !item.interactive) {
    score -= 50;
  }

  if (query.tag && normalize(item.tag) === normalize(query.tag)) {
    score += 40;
  }

  if (query.type && normalize(item.type) === normalize(query.type)) {
    score += 30;
  }

  if (item.disabled) {
    score -= 80;
  }

  return score;
}

export function resolveRef(snapshot, query = {}) {
  if (!snapshot?.items?.length) {
    return null;
  }

  if (query.ref) {
    return snapshot.items.find(item => item.ref === query.ref) || null;
  }

  let best = null;
  for (const item of snapshot.items) {
    const score = scoreItem(item, query);
    if (score <= 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = { score, item };
    }
  }

  return best?.item || null;
}

export function buildTemplateDescriptor(item, query = {}) {
  if (!item) {
    return null;
  }

  return {
    hint: query.hint || item.text || item.ariaLabel || item.placeholder || '',
    text: item.text || '',
    role: item.role || '',
    tag: item.tag || '',
    type: item.type || '',
    containerHint: query.containerHint || item.contextText || '',
    preferInteractive: true
  };
}
