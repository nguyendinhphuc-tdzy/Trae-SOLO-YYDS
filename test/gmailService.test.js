const test = require("node:test");
const assert = require("node:assert/strict");

const { createGmailService } = require("../src/services/gmailService");

test("createGmailService is disabled without env/config", async () => {
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_TO;

  const svc = createGmailService();
  assert.equal(svc.enabled, false);

  const res = await svc.sendMail({ subject: "x", text: "y" });
  assert.deepEqual(res, { skipped: true });
});
