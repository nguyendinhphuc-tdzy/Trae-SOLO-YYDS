const test = require('node:test');
const assert = require('node:assert/strict');

const { parseGeminiJson, validateDecisionPayload } = require('../src/services/aiService');

test('parseGeminiJson parses JSON wrapped in code fences', () => {
  const res = parseGeminiJson('```json\n{"decision":"IGNORE"}\n```');
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, { decision: 'IGNORE' });
});

test('parseGeminiJson extracts the first JSON object from mixed output', () => {
  const res = parseGeminiJson('Some text before\n{"decision":"IGNORE"}\nTrailing text');
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, { decision: 'IGNORE' });
});

test('parseGeminiJson returns a structured error when no JSON exists', () => {
  const res = parseGeminiJson('no json here');
  assert.equal(res.ok, false);
  assert.equal(res.error.type, 'AI_JSON_PARSE_ERROR');
});

test('validateDecisionPayload accepts and normalizes a CREATE_SUBTASK payload', () => {
  const payload = {
    decision: 'create_subtask',
    reason: ' because ',
    summary: '  Fix login ',
    description: ' reset password flow ',
    priority: 'high',
    assignee_id: 'A1',
  };

  const res = validateDecisionPayload(payload, { assigneeAllowList: ['A1', 'B2'] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, {
    decision: 'CREATE_SUBTASK',
    reason: 'because',
    summary: 'Fix login',
    description: 'reset password flow',
    priority: 'High',
    assignee_id: 'A1',
  });
});

test('validateDecisionPayload rejects unexpected keys', () => {
  const payload = {
    decision: 'CREATE_SUBTASK',
    reason: 'x',
    summary: 'x',
    description: 'x',
    priority: 'High',
    assignee_id: 'A1',
    extra: 'nope',
  };

  const res = validateDecisionPayload(payload, { assigneeAllowList: ['A1'] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((err) => err.message.includes('Unexpected keys')));
});

test('validateDecisionPayload rejects missing required keys (even for IGNORE)', () => {
  const payload = { decision: 'IGNORE', reason: 'noop' };
  const res = validateDecisionPayload(payload, { assigneeAllowList: ['A1'] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((err) => err.message.includes('Missing required keys')));
});

test('validateDecisionPayload normalizes IGNORE payload to safe defaults', () => {
  const payload = {
    decision: 'IGNORE',
    reason: 'noop',
    summary: 'should be cleared',
    description: 'should be cleared',
    priority: 'High',
    assignee_id: 'NOT_ALLOWED',
  };

  const res = validateDecisionPayload(payload, { assigneeAllowList: ['A1'] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, {
    decision: 'IGNORE',
    reason: 'noop',
    summary: '',
    description: '',
    priority: 'Medium',
    assignee_id: 'A1',
  });
});
