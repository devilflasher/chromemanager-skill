import fs from 'node:fs';
import path from 'node:path';

function parseJsonString(value, label) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function ensureStepShape(step, index) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`Plan step ${index + 1} must be an object`);
  }
  if (!step.action) {
    throw new Error(`Plan step ${index + 1} is missing "action"`);
  }
  if (step.action === 'run-plan') {
    throw new Error(`Nested run-plan is not supported at step ${index + 1}`);
  }
  return {
    ...step
  };
}

function toPathSegments(expression) {
  return String(expression)
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\["([^"]+)"\]/g, '.$1')
    .replace(/\['([^']+)'\]/g, '.$1')
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean);
}

function lookupPath(root, expression) {
  const segments = toPathSegments(expression);
  let current = root;

  for (const segment of segments) {
    if (current == null || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function parsePlanInput(args) {
  let rawPlan = null;

  if (args.plan) {
    rawPlan = parseJsonString(args.plan, '--plan');
  } else if (args.planJson) {
    rawPlan = parseJsonString(args.planJson, '--planJson');
  } else if (args.planFile) {
    const filePath = path.resolve(String(args.planFile));
    rawPlan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } else if (Array.isArray(args.steps)) {
    rawPlan = args.steps;
  }

  if (!rawPlan) {
    throw new Error('run-plan requires --plan, --planJson, --planFile, or a taskFile payload with "steps"');
  }

  let steps;
  let meta = {};

  if (Array.isArray(rawPlan)) {
    steps = rawPlan;
  } else if (Array.isArray(rawPlan.steps)) {
    steps = rawPlan.steps;
    meta = {
      ...rawPlan
    };
    delete meta.steps;
  } else {
    throw new Error('Plan payload must be an array or an object with a "steps" array');
  }

  return {
    meta,
    steps: steps.map(ensureStepShape)
  };
}

export function buildStepArgs(baseArgs, planMeta, step, index) {
  const merged = {
    ...baseArgs,
    ...planMeta,
    ...step
  };

  delete merged.plan;
  delete merged.planJson;
  delete merged.planFile;
  delete merged.steps;

  return {
    ...merged,
    action: step.action,
    stepIndex: index,
    stepName: step.name || `step-${index + 1}`
  };
}

function replaceInString(value, context) {
  const exactMatch = String(value).match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (exactMatch) {
    const resolved = lookupPath(context, exactMatch[1]);
    return resolved === undefined ? value : resolved;
  }

  return String(value).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_full, expression) => {
    const resolved = lookupPath(context, expression);
    if (resolved === undefined) {
      return `{{${expression}}}`;
    }
    if (typeof resolved === 'object') {
      return JSON.stringify(resolved);
    }
    return String(resolved);
  });
}

function replaceTemplatesDeep(value, context) {
  if (typeof value === 'string') {
    return replaceInString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map(item => replaceTemplatesDeep(item, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, innerValue]) => [key, replaceTemplatesDeep(innerValue, context)])
    );
  }
  return value;
}

export function createPlanContext(stepResults) {
  const steps = {};

  for (const step of stepResults) {
    steps[String(step.stepIndex)] = step;
    steps[step.stepName] = step;
  }

  return {
    steps,
    last: stepResults.length ? stepResults[stepResults.length - 1] : null
  };
}

export function resolveStepTemplates(stepArgs, context) {
  return replaceTemplatesDeep(stepArgs, context);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTruthy(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return !!value;
}

export function shouldRunStep(stepArgs, context) {
  const condition = stepArgs.when;
  if (condition == null) {
    return { run: true, reason: 'no condition' };
  }

  if (typeof condition === 'string') {
    const resolved = replaceInString(condition, context);
    return {
      run: isTruthy(resolved) && resolved !== 'false',
      reason: `string condition resolved to ${resolved}`
    };
  }

  if (typeof condition !== 'object' || Array.isArray(condition)) {
    throw new Error('Step "when" must be a string or object');
  }

  const actual = lookupPath(context, condition.path || condition.ref || '');
  if (condition.exists === true) {
    return {
      run: actual !== undefined,
      reason: `exists(${condition.path || condition.ref})`
    };
  }
  if (condition.exists === false) {
    return {
      run: actual === undefined,
      reason: `not exists(${condition.path || condition.ref})`
    };
  }
  if (condition.truthy === true) {
    return {
      run: isTruthy(actual),
      reason: `truthy(${condition.path || condition.ref})`
    };
  }
  if (condition.truthy === false) {
    return {
      run: !isTruthy(actual),
      reason: `falsy(${condition.path || condition.ref})`
    };
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    const expected = replaceTemplatesDeep(condition.equals, context);
    return {
      run: valuesEqual(actual, expected),
      reason: `equals(${condition.path || condition.ref})`
    };
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
    const expected = replaceTemplatesDeep(condition.notEquals, context);
    return {
      run: !valuesEqual(actual, expected),
      reason: `notEquals(${condition.path || condition.ref})`
    };
  }
  if (typeof actual === 'string' && Object.prototype.hasOwnProperty.call(condition, 'includes')) {
    const expected = String(replaceTemplatesDeep(condition.includes, context));
    return {
      run: actual.includes(expected),
      reason: `includes(${condition.path || condition.ref})`
    };
  }

  throw new Error('Unsupported step "when" condition');
}

export function createSkippedStepResult(stepIndex, stepName, action, reason) {
  return {
    ok: true,
    skipped: true,
    stepIndex,
    stepName,
    action,
    result: {
      ok: true,
      skipped: true,
      action,
      reason
    }
  };
}

export function resolveFailurePolicy(rawPolicy, stopOnFailureDefault = true) {
  const normalized = String(
    rawPolicy == null
      ? (stopOnFailureDefault ? 'stop' : 'continue')
      : rawPolicy
  ).trim().toLowerCase();

  switch (normalized) {
    case 'stop':
    case 'continue':
    case 'skipremaining':
    case 'skip_remaining':
    case 'skip-remaining':
      return normalized.startsWith('skip') ? 'skipRemaining' : normalized;
    default:
      throw new Error(`Unsupported onFailure policy: ${rawPolicy}`);
  }
}

export function summarizePlanResults(mode, steps) {
  const failedSteps = steps
    .filter(step => !step.ok)
    .map(step => ({
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      action: step.action
    }));
  const skippedSteps = steps
    .filter(step => step.skipped)
    .map(step => ({
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      action: step.action
    }));

  return {
    ok: failedSteps.length === 0,
    action: 'run-plan',
    mode,
    totalSteps: steps.length,
    failedSteps,
    skippedSteps,
    steps
  };
}
