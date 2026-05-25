const qrcode = require("qrcode-terminal");

const loggedGroupChatIds = new Set();

function safeToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function logEvent(type, payload) {
  try {
    const line = payload ? `${type} ${JSON.stringify(payload)}` : type;
    console.log(line);
  } catch {
    console.log(type);
  }
}

function clampNumber(value, { min, max, fallback }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function truncateText(text, maxChars) {
  const str = safeToString(text);
  if (!maxChars || str.length <= maxChars) return str;
  return `${str.slice(0, maxChars - 1)}…`;
}

async function resolveSenderName(message) {
  try {
    const contact = await message.getContact();
    return (
      safeToString(contact?.pushname).trim() ||
      safeToString(contact?.name).trim() ||
      safeToString(contact?.number).trim()
    );
  } catch {
    return (
      safeToString(message?._data?.notifyName).trim() ||
      safeToString(message?._data?.sender?.pushname).trim()
    );
  }
}

async function fetchChatTranscript(message, options = {}) {
  const limit = clampNumber(options.limit, { min: 1, max: 30, fallback: 20 });
  const perLineLimit = clampNumber(options.perLineLimit, { min: 50, max: 1000, fallback: 400 });
  const includeFromMeLabel = safeToString(options.fromMeLabel).trim() || "Me";

  const chat = await message.getChat();
  const fetched = await chat.fetchMessages({ limit });
  const messages = Array.isArray(fetched) ? fetched : [];

  messages.sort((a, b) => {
    const ta = Number(a?.timestamp) || 0;
    const tb = Number(b?.timestamp) || 0;
    return ta - tb;
  });

  const lines = [];
  for (const msg of messages) {
    const body = safeToString(msg?.body).trim();
    if (!body) continue;

    const sender = msg?.fromMe ? includeFromMeLabel : await resolveSenderName(msg);
    const senderLabel = safeToString(sender).trim() || "Unknown";
    lines.push(`${senderLabel}: ${truncateText(body, perLineLimit)}`);
  }

  return lines.join("\n");
}

async function normalizeMessage(message) {
  const messageId = safeToString(message?.id?._serialized).trim();
  const chatId = safeToString(message?.from).trim();
  const text = safeToString(message?.body).trim();
  const senderName = (await resolveSenderName(message)) || "";

  if (!messageId || !chatId) return null;

  return { messageId, chatId, text, senderName };
}

function startWhatsAppIngestion(options) {
  const { Client, LocalAuth } = require("whatsapp-web.js");

  const authPath = safeToString(options?.authPath || process.env.WA_AUTH_PATH).trim();
  const isVipClient = options?.isVipClient;
  const shouldContinueForMessageId = options?.shouldContinueForMessageId;
  const onEvent = options?.onEvent;
  const transcriptLimit = clampNumber(
    options?.transcriptLimit ?? process.env.WA_TRANSCRIPT_LIMIT,
    { min: 1, max: 30, fallback: 20 }
  );

  if (!authPath) throw new Error("Missing WA_AUTH_PATH");
  if (typeof isVipClient !== "function") throw new Error("isVipClient is required");
  if (typeof shouldContinueForMessageId !== "function")
    throw new Error("shouldContinueForMessageId is required");
  if (typeof onEvent !== "function") throw new Error("onEvent is required");

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...(options?.puppeteer || {}),
    },
  });

  client.on("qr", (qr) => {
    logEvent("whatsapp.qr", { needsAuth: true });
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => logEvent("whatsapp.ready"));
  client.on("authenticated", () => logEvent("whatsapp.authenticated"));
  client.on("auth_failure", (msg) =>
    logEvent("whatsapp.auth_failure", { message: safeToString(msg).slice(0, 200) })
  );
  client.on("disconnected", (reason) =>
    logEvent("whatsapp.disconnected", { reason: safeToString(reason).slice(0, 200) })
  );

  client.on("message", async (message) => {
    if (message?.fromMe) return;
    try {
      const chat = await message.getChat();
      const chatId = safeToString(message?.from).trim();
      const isGroup = Boolean(chat?.isGroup);
      if (isGroup && chatId && !loggedGroupChatIds.has(chatId)) {
        loggedGroupChatIds.add(chatId);
        logEvent("whatsapp.group_chat_detected", {
          chatId,
          name: safeToString(chat?.name).trim(),
        });
      }
    } catch {}
    const event = await normalizeMessage(message);
    if (!event) return;
    if (!event.text) return;

    try {
      event.chatTranscript = await fetchChatTranscript(message, { limit: transcriptLimit });
    } catch (error) {
      logEvent("whatsapp.transcript_error", {
        messageId: event.messageId,
        chatId: event.chatId,
        message: safeToString(error?.message).slice(0, 200),
      });
      event.chatTranscript = `${event.senderName || event.chatId || "Unknown"}: ${event.text}`;
    }

    try {
      const isVip = await isVipClient(event.chatId);
      if (!isVip) return;
    } catch (error) {
      logEvent("whatsapp.vip_check_error", {
        messageId: event.messageId,
        chatId: event.chatId,
        message: safeToString(error?.message).slice(0, 200),
      });
      return;
    }

    try {
      const shouldContinue = await shouldContinueForMessageId(event.messageId);
      if (!shouldContinue) return;
    } catch (error) {
      logEvent("whatsapp.idempotency_error", {
        messageId: event.messageId,
        chatId: event.chatId,
        message: safeToString(error?.message).slice(0, 200),
      });
      return;
    }

    try {
      await onEvent(event);
    } catch (error) {
      logEvent("whatsapp.downstream_error", {
        messageId: event.messageId,
        chatId: event.chatId,
        message: safeToString(error?.message).slice(0, 200),
      });
    }
  });

  client.initialize();

  return { client };
}

module.exports = {
  startWhatsAppIngestion,
  normalizeMessage,
};
