export function createWindowResult(base, overrides = {}) {
  return {
    ok: false,
    action: base.action,
    mode: base.mode,
    windowNumber: base.windowNumber,
    url: base.url || '',
    snapshotId: base.snapshotId || '',
    usedRef: base.usedRef || '',
    retryable: false,
    reason: '',
    ...overrides
  };
}

function firstDefined(results, field) {
  for (const result of results) {
    if (result?.[field] !== undefined && result?.[field] !== null && result?.[field] !== '') {
      return result[field];
    }
  }
  return null;
}

export function summarizeFleetResults(action, mode, results) {
  const failed = results.filter(result => !result.ok).map(result => result.windowNumber);
  const succeeded = results.filter(result => result.ok);
  const valuesByWindow = Object.fromEntries(
    results
      .filter(result => result.value !== undefined)
      .map(result => [String(result.windowNumber), result.value])
  );
  const filesByWindow = Object.fromEntries(
    results
      .filter(result => result.filePath)
      .map(result => [String(result.windowNumber), result.filePath])
  );
  const refsByWindow = Object.fromEntries(
    results
      .filter(result => result.usedRef)
      .map(result => [String(result.windowNumber), result.usedRef])
  );
  const snapshotIdsByWindow = Object.fromEntries(
    results
      .filter(result => result.snapshotId)
      .map(result => [String(result.windowNumber), result.snapshotId])
  );

  return {
    ok: failed.length === 0,
    action,
    mode,
    total: results.length,
    failedWindows: failed,
    succeededWindows: succeeded.map(result => result.windowNumber),
    firstValue: firstDefined(results, 'value'),
    firstFilePath: firstDefined(results, 'filePath'),
    firstRef: firstDefined(results, 'usedRef'),
    firstSnapshotId: firstDefined(results, 'snapshotId'),
    valuesByWindow,
    filesByWindow,
    refsByWindow,
    snapshotIdsByWindow,
    results
  };
}
