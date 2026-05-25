function safeToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function createWhatsAppNotifyService(config = {}) {
  const client = config.client;
  const chatId = safeToString(
    config.chatId || process.env.WA_INTERNAL_NOTIFY_CHAT_ID
  ).trim();

  const enabled = Boolean(client && chatId);

  async function sendMessage(text, options = {}) {
    if (!enabled) return { skipped: true };

    const to = safeToString(options.chatId || chatId).trim();
    const safeText = safeToString(text);
    if (!to) return { skipped: true };
    if (!safeText) throw new Error("text is required");

    return client.sendMessage(to, safeText);
  }

  return {
    enabled,
    chatId,
    sendMessage,
    sendWhatsAppMessage: sendMessage,
  };
}

module.exports = { createWhatsAppNotifyService };
