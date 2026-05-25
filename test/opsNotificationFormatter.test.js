const test = require("node:test");
const assert = require("node:assert/strict");

const { formatSubtaskCreatedMessage } = require("../src/services/opsNotificationFormatter");

test("formatSubtaskCreatedMessage is plain text and includes reason/priority", () => {
  const text = formatSubtaskCreatedMessage({
    taskTitle: "Fix login",
    assigneeName: "Sam",
    jiraKey: "OPS-1",
    jiraBaseUrl: "https://example.atlassian.net",
    reason: "New topic from client",
    priority: "High",
  });

  assert.ok(text.includes("NEW SUBTASK CREATED"));
  assert.ok(text.includes("Priority: High"));
  assert.ok(text.includes("Reason: New topic from client"));
  assert.ok(!text.includes("*"));
});
