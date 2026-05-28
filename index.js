const dotenv = require("dotenv");
const express = require("express");

const { validateEnv } = require("./src/env");
const { isVipClient, shouldContinueForMessageId } = require("./src/services/supabaseService");
const { createJiraService, sanitizeJiraLabel, formatJiraContext } = require("./src/services/jiraService");
const { getAiDecision } = require("./src/services/aiService");
const { createWhatsAppNotifyService } = require("./src/services/whatsappNotifyService");
const { createGmailService } = require("./src/services/gmailService");
const { formatSubtaskCreatedMessage } = require("./src/services/opsNotificationFormatter");
const { startWhatsAppIngestion } = require("./src/services/whatsappIngestion");

dotenv.config();
validateEnv();

const app = express();

app.get("/ping", (req, res) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

function safeToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function logError(type, error, context = {}) {
  const status = error?.response?.status;
  const responseData = error?.response?.data;
  const responseText =
    typeof responseData === "string"
      ? responseData.slice(0, 1000)
      : responseData
        ? JSON.stringify(responseData).slice(0, 1000)
        : "";

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

const jiraService = createJiraService();
let waNotifyService = createWhatsAppNotifyService();
const gmailService = createGmailService();

const vipMode = safeToString(process.env.VIP_MODE).trim().toLowerCase() || "strict";
const isVipClientForIngestion =
  vipMode === "allow_all" ? async () => true : isVipClient;

async function processInboundMessage(event) {
  const messageId = safeToString(event?.messageId).trim();
  const chatId = safeToString(event?.chatId).trim();
  const text = safeToString(event?.text).trim();
  const senderName = safeToString(event?.senderName).trim();
  const inboundTranscript = safeToString(event?.chatTranscript).trim();

  const ctx = { messageId, chatId };

  try {
    const label = sanitizeJiraLabel(senderName, chatId);

    let issues = [];
    try {
      issues = await jiraService.getOpenIssuesByLabel(label);
    } catch (error) {
      logError("jira_get_open_issues_failed", error, ctx);
      issues = [];
    }

    const jiraContext = formatJiraContext(issues);
    const chatTranscript = inboundTranscript || `${senderName || chatId || "Unknown"}: ${text || ""}`;

    const aiResult = await getAiDecision({ chatTranscript, jiraContext });
    if (aiResult?.error) {
      logError("ai_decision_error", aiResult.error, {
        ...ctx,
        aiErrorType: safeToString(aiResult.error.type).slice(0, 100),
      });
    }

    const decisionPayload = aiResult?.decisionPayload;
    const decision = safeToString(decisionPayload?.decision).toUpperCase();

    if (!decision || decision === "IGNORE") {
      return { status: "ignored", reason: safeToString(decisionPayload?.reason).slice(0, 200) };
    }

    let parentIssue;
    try {
      parentIssue = await jiraService.findOrCreateParentIssue(label, senderName);
    } catch (error) {
      logError("jira_parent_issue_failed", error, ctx);
      return { status: "error", step: "jira_parent" };
    }

    const parentKey = safeToString(parentIssue?.key).trim();
    if (!parentKey) return { status: "error", step: "jira_parent_missing_key" };

    if (decision === "COMMENT") {
      try {
        await jiraService.addComment(parentKey, decisionPayload, chatTranscript);
        return { status: "commented", parentKey };
      } catch (error) {
        logError("jira_add_comment_failed", error, ctx);
        return { status: "error", step: "jira_comment" };
      }
    }

    if (decision === "CREATE_SUBTASK") {
      let subtask;
      try {
        subtask = await jiraService.createSubtask(parentKey, decisionPayload);
      } catch (error) {
        logError("jira_create_subtask_failed", error, ctx);
        return { status: "error", step: "jira_subtask" };
      }

      try {
        const messageText = formatSubtaskCreatedMessage({
          taskTitle: subtask?.fields?.summary,
          assigneeName: subtask?.fields?.assignee?.displayName || "Team",
          jiraKey: subtask?.key,
          jiraBaseUrl: jiraService.baseUrl,
          reason: safeToString(decisionPayload?.reason).slice(0, 1000),
          priority: safeToString(decisionPayload?.priority).slice(0, 50),
        });
        await waNotifyService.sendMessage(messageText);
      } catch (error) {
        logError("whatsapp_notify_failed", error, ctx);
      }

      try {
        const jiraKey = safeToString(subtask?.key).trim();
        const summary = safeToString(subtask?.fields?.summary).trim();
        const subject = jiraKey
          ? `New Jira subtask created: ${jiraKey}${summary ? ` - ${summary}` : ""}`
          : "New Jira subtask created";

        const messageText = formatSubtaskCreatedMessage({
          taskTitle: subtask?.fields?.summary,
          assigneeName: subtask?.fields?.assignee?.displayName || "Team",
          jiraKey: subtask?.key,
          jiraBaseUrl: jiraService.baseUrl,
          reason: safeToString(decisionPayload?.reason).slice(0, 1000),
          priority: safeToString(decisionPayload?.priority).slice(0, 50),
        });

        await gmailService.sendMail({ subject, text: messageText });
      } catch (error) {
        logError("gmail_notify_failed", error, ctx);
      }

      return { status: "subtask_created", jiraKey: safeToString(subtask?.key).trim(), parentKey };
    }

    return { status: "ignored", reason: "UNKNOWN_DECISION" };
  } catch (error) {
    logError("process_inbound_message_failed", error, ctx);
    return { status: "error", step: "pipeline" };
  }
}

try {
  const { client } = startWhatsAppIngestion({
    authPath: process.env.WA_AUTH_PATH,
    isVipClient: isVipClientForIngestion,
    shouldContinueForMessageId,
    onEvent: processInboundMessage,
  });
  waNotifyService = createWhatsAppNotifyService({ client });
} catch (error) {
  logError("whatsapp_init_failed", error);
}
