function safeToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function parseEmailList(value) {
  return safeToString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createGmailService(config = {}) {
  const user = safeToString(config.user || process.env.GMAIL_USER).trim();
  const appPassword = safeToString(
    config.appPassword || process.env.GMAIL_APP_PASSWORD
  ).trim();
  const from = safeToString(config.from || process.env.GMAIL_FROM || user).trim();
  const to = parseEmailList(config.to || process.env.GMAIL_TO);

  const enabled = Boolean(user && appPassword && to.length);

  async function sendMail(input) {
    if (!enabled) return { skipped: true };

    const subject = safeToString(input?.subject).trim();
    const text = safeToString(input?.text);
    const html = input?.html ? safeToString(input.html) : undefined;

    if (!subject) throw new Error("subject is required");
    if (!text && !html) throw new Error("text or html is required");

    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });

    const result = await transport.sendMail({
      from,
      to: to.join(","),
      subject,
      text: text || undefined,
      html,
    });

    return result;
  }

  return {
    enabled,
    from,
    to,
    sendMail,
    sendEmail: sendMail,
  };
}

module.exports = { createGmailService };
