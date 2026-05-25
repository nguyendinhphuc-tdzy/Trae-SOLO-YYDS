const axios = require('axios');

function normalizeBotToken(token) {
  const t = (token || '').toString().trim();
  if (!t) return '';
  return t.startsWith('bot') ? t.slice(3) : t;
}

function createTelegramService(config = {}) {
  const botToken = normalizeBotToken(config.botToken || process.env.TELEGRAM_BOT_TOKEN);
  const chatId = (config.chatId || process.env.TELEGRAM_CHAT_ID || '').toString().trim();

  if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  if (!chatId) throw new Error('Missing TELEGRAM_CHAT_ID');

  async function sendMessage(text, options = {}) {
    const safeText = (text || '').toString();
    if (!safeText) throw new Error('text is required');

    const parseMode = options.parseMode || 'Markdown';
    const disableWebPreview =
      options.disable_web_page_preview ?? options.disableWebPreview ?? true;

    const payload = {
      chat_id: options.chatId || chatId,
      text: safeText,
      parse_mode: parseMode,
      disable_web_page_preview: disableWebPreview,
    };

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      const res = await axios.post(url, payload, { timeout: 20_000 });
      if (!res.data?.ok) {
        const desc = res.data?.description ? res.data.description.toString() : 'Unknown error';
        throw new Error(`Telegram sendMessage failed: ${desc}`);
      }
      return res.data.result;
    } catch (err) {
      const message = err?.response?.data?.description
        ? err.response.data.description.toString()
        : err?.message || 'Unknown error';
      throw new Error(`Telegram sendMessage failed: ${message}`);
    }
  }

  function formatSubtaskCreatedMessage(input) {
    const taskTitle = (input?.taskTitle || input?.summary || 'New Task').toString();
    const assigneeName = (input?.assigneeName || 'Team').toString();
    const jiraKey = (input?.jiraKey || '').toString();
    const jiraBaseUrl = (input?.jiraBaseUrl || process.env.JIRA_BASE_URL || '').toString().replace(/\/+$/, '');
    const reason = (input?.reason || '').toString();
    const priority = (input?.priority || '').toString();

    const link = jiraKey
      ? `${jiraBaseUrl ? jiraBaseUrl : 'https://your-jira-domain.atlassian.net'}/browse/${jiraKey}`
      : '';

    const lines = [
      '*NEW SUBTASK CREATED*',
      '',
      `*Task:* ${taskTitle}`,
      `*Assignee:* ${assigneeName}`,
    ];

    if (jiraKey) lines.push(`*Key:* ${jiraKey}`);
    if (link) lines.push(`*Link:* ${link}`);
    if (priority) lines.push(`*Priority:* ${priority}`);
    if (reason) lines.push('', `*Reason:* ${reason}`);

    return lines.join('\n');
  }

  return {
    sendMessage,
    sendTelegramMessage: sendMessage,
    formatSubtaskCreatedMessage,
  };
}

module.exports = { createTelegramService };
