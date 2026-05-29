// ==========================================
// 1. LOAD ENVIRONMENT VARIABLES FIRST
// ==========================================
require('dotenv').config();

const express = require('express');

const { validateEnv } = require('./src/env');
const { getAiDecision } = require('./src/services/aiService');
const { startWhatsAppIngestion } = require('./src/services/whatsappIngestion');
const { createWhatsAppNotifyService } = require('./src/services/whatsappNotifyService');
const { createGmailService } = require('./src/services/gmailService');
const {
  isVipClient,
  shouldContinueForMessageId,
  upsertClient,
  createTicket,
  createConversation,
  getOpenTicketContext,
  logAnalyticsEvent,
} = require('./src/services/supabaseService');

// ==========================================
// 2. VALIDATE ENVIRONMENT
// ==========================================
validateEnv();

const app = express();

// Keep-alive for Render
app.get('/ping', (req, res) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// ==========================================
// 3. NOTIFICATION SERVICES
// ==========================================
let waNotifyService = createWhatsAppNotifyService();
const gmailService = createGmailService();

const vipMode = (process.env.VIP_MODE || 'strict').trim().toLowerCase() || 'strict';
const isVipClientForIngestion =
  vipMode === 'allow_all' ? async () => true : isVipClient;

// ==========================================
// 4. PIPELINE
// ==========================================
function safeToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

function formatTicketCreatedMessage({ taskTitle, assigneeName, ticketId, reason, priority }) {
  const lines = [
    'NEW TICKET CREATED',
    '',
    `Task: ${taskTitle || 'N/A'}`,
    `Assignee: ${assigneeName || 'Team'}`,
    `Priority: ${priority || 'Medium'}`,
    `Status: Open`,
    '',
    `Reason: ${reason || 'N/A'}`,
  ];
  return lines.join('\n');
}

function logError(type, error, context = {}) {
  const status = error?.response?.status;
  const responseData = error?.response?.data;
  const responseText =
    typeof responseData === 'string'
      ? responseData.slice(0, 1000)
      : responseData
        ? JSON.stringify(responseData).slice(0, 1000)
        : '';

  const requestUrl = safeToString(error?.config?.url).slice(0, 300);
  const requestMethod = safeToString(error?.config?.method).slice(0, 20);

  const payload = {
    type,
    message: safeToString(error?.message).slice(0, 500),
    name: safeToString(error?.name).slice(0, 100),
    ...(status ? { status } : {}),
    ...(responseText ? { response: responseText } : {}),
    ...(requestUrl ? { requestUrl } : {}),
    ...(requestMethod ? { requestMethod } : {}),
    ...context,
  };
  console.error(JSON.stringify(payload));
}

async function processInboundMessage(event) {
  const messageId = safeToString(event?.messageId).trim();
  const chatId = safeToString(event?.chatId).trim();
  const text = safeToString(event?.text).trim();
  const senderName = safeToString(event?.senderName).trim();
  const inboundTranscript = safeToString(event?.chatTranscript).trim();

  const ctx = { messageId, chatId };

  try {
    // Upsert client record
    try {
      await upsertClient({ chatId, displayName: senderName });
    } catch (e) {
      logError('client_upsert_failed', e, ctx);
    }

    // Get open tickets for context
    const openTickets = await getOpenTicketContext(chatId);

    let ticketsContext = 'No existing open tickets.';
    if (openTickets.length > 0) {
      ticketsContext = openTickets
        .map(
          (t) =>
            `- [${t.status}] ${t.summary || 'N/A'} (Priority: ${t.priority || 'N/A'}, Created: ${new Date(t.created_at).toLocaleDateString()})`
        )
        .join('\n');
    }

    const chatTranscript =
      inboundTranscript || `${senderName || chatId || 'Unknown'}: ${text || ''}`;

    // AI decision
    const aiResult = await getAiDecision({ chatTranscript, jiraContext: ticketsContext });
    if (aiResult?.error) {
      logError('ai_decision_error', aiResult.error, {
        ...ctx,
        aiErrorType: safeToString(aiResult.error.type).slice(0, 100),
      });
    }

    const decisionPayload = aiResult?.decisionPayload;
    const decision = safeToString(decisionPayload?.decision).toUpperCase();

    // Log conversation
    try {
      await createConversation({
        chatId,
        clientName: senderName,
        messageId,
        direction: 'inbound',
        text,
        aiDecision: decision,
      });
    } catch (e) {
      logError('conversation_log_failed', e, ctx);
    }

    if (!decision || decision === 'IGNORE') {
      await logAnalyticsEvent('conversation_ignored', { chatId, reason: decisionPayload?.reason });
      return { status: 'ignored', reason: safeToString(decisionPayload?.reason).slice(0, 200) };
    }

    // Create ticket
    let ticket;
    try {
      ticket = await createTicket({
        chatId,
        clientName: senderName,
        summary: decisionPayload?.summary,
        description: decisionPayload?.description,
        priority: decisionPayload?.priority,
        assigneeId: decisionPayload?.assignee_id,
        assigneeName: null,
        aiReason: decisionPayload?.reason,
      });
    } catch (error) {
      logError('ticket_create_failed', error, ctx);
      return { status: 'error', step: 'ticket_create' };
    }

    const ticketId = ticket?.id;
    const ticketSummary = ticket?.summary;

    // Link conversation to ticket
    try {
      await createConversation({
        chatId,
        clientName: senderName,
        messageId,
        direction: 'inbound',
        text: `[Ticket #${ticketId}] ${text}`,
        aiDecision: decision,
        ticketId,
      });
    } catch (e) {
      // non-fatal
    }

    // Log analytics
    await logAnalyticsEvent('ticket_created', {
      chatId,
      ticketId,
      priority: decisionPayload?.priority,
      decision,
    });

    // WhatsApp notification
    try {
      const msgText = formatTicketCreatedMessage({
        taskTitle: ticketSummary,
        assigneeName: 'Team',
        ticketId,
        reason: safeToString(decisionPayload?.reason).slice(0, 1000),
        priority: safeToString(decisionPayload?.priority).slice(0, 50),
      });
      await waNotifyService.sendMessage(msgText);
    } catch (error) {
      logError('whatsapp_notify_failed', error, ctx);
    }

    // Gmail notification
    try {
      const subject = ticketId ? `New ticket created: #${ticketId}` : 'New ticket created';
      const msgText = formatTicketCreatedMessage({
        taskTitle: ticketSummary,
        assigneeName: 'Team',
        ticketId,
        reason: safeToString(decisionPayload?.reason).slice(0, 1000),
        priority: safeToString(decisionPayload?.priority).slice(0, 50),
      });
      await gmailService.sendMail({ subject, text: msgText });
    } catch (error) {
      logError('gmail_notify_failed', error, ctx);
    }

    return { status: 'ticket_created', ticketId, ticketSummary };
  } catch (error) {
    logError('process_inbound_message_failed', error, ctx);
    return { status: 'error', step: 'pipeline' };
  }
}

// ==========================================
// 5. START WHATSAPP LISTENER
// ==========================================
try {
  const { client } = startWhatsAppIngestion({
    authPath: process.env.WA_AUTH_PATH,
    isVipClient: isVipClientForIngestion,
    shouldContinueForMessageId,
    onEvent: processInboundMessage,
  });
  waNotifyService = createWhatsAppNotifyService({ client });
} catch (error) {
  logError('whatsapp_init_failed', error);
}
