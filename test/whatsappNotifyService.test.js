const test = require("node:test");
const assert = require("node:assert/strict");

const { createWhatsAppNotifyService } = require("../src/services/whatsappNotifyService");

test("createWhatsAppNotifyService skips when not configured", async () => {
  delete process.env.WA_INTERNAL_NOTIFY_CHAT_ID;

  const svc = createWhatsAppNotifyService();
  assert.equal(svc.enabled, false);

  const res = await svc.sendMessage("hello");
  assert.deepEqual(res, { skipped: true });
});

test("createWhatsAppNotifyService sends when configured", async () => {
  const sent = [];
  const mockClient = {
    sendMessage: async (to, text) => {
      sent.push({ to, text });
      return { ok: true };
    },
  };

  const svc = createWhatsAppNotifyService({ client: mockClient, chatId: "123@g.us" });
  assert.equal(svc.enabled, true);

  await svc.sendMessage("hi");
  assert.deepEqual(sent, [{ to: "123@g.us", text: "hi" }]);
});
