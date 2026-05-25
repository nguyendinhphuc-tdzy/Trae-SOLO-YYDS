const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeJiraLabel, buildCommentText } = require('../src/services/jiraService');

test('sanitizeJiraLabel strips non-alphanumerics and preserves stable label', () => {
  assert.equal(sanitizeJiraLabel('Acme Co.', '123'), 'AcmeCo');
  assert.equal(sanitizeJiraLabel('ACME-123!', 'zzz'), 'ACME123');
});

test('sanitizeJiraLabel falls back to chatId when cleaned name is too short', () => {
  assert.equal(sanitizeJiraLabel('A!', '123-456'), 'Client123456');
  assert.equal(sanitizeJiraLabel('', 'abc_def_ghi_jkl'), 'Clientabcdefghij');
});

test('sanitizeJiraLabel falls back to Unknown when name and chatId are unusable', () => {
  assert.equal(sanitizeJiraLabel('!!', ''), 'ClientUnknown');
  assert.equal(sanitizeJiraLabel(null, null), 'ClientUnknown');
});

test('buildCommentText follows decision schema keys and excludes suggested_solution', () => {
  const decisionPayload = {
    decision: 'COMMENT',
    reason: 'needs clarification',
    summary: 'Clarify timeline',
    description: 'Ask for the deadline and constraints.',
    priority: 'Medium',
    assignee_id: 'A1',
    suggested_solution: 'should not appear',
  };

  const text = buildCommentText(decisionPayload, 'Alice: hi');
  assert.ok(text.includes('decision: COMMENT'));
  assert.ok(text.includes('reason: needs clarification'));
  assert.ok(text.includes('summary: Clarify timeline'));
  assert.ok(text.includes('priority: Medium'));
  assert.ok(text.includes('assignee_id: A1'));
  assert.ok(text.includes('description:\nAsk for the deadline and constraints.'));
  assert.ok(text.includes('chat_transcript:\nAlice: hi'));
  assert.ok(!text.includes('suggested_solution'));
  assert.ok(!text.toLowerCase().includes('suggested solution'));
});
