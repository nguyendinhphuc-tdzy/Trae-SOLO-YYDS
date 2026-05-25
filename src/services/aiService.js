const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const DECISION_ALLOW_LIST = new Set(["CREATE_SUBTASK", "COMMENT", "IGNORE"]);
const PRIORITY_ALLOW_LIST = new Set(["High", "Medium"]);

function getAssigneeAllowListFromEnv() {
  return [
    process.env.JIRA_ASSIGNEE_DANI_ID,
    process.env.JIRA_ASSIGNEE_SAM_ID,
    process.env.JIRA_ASSIGNEE_JAY_ID,
  ].filter(Boolean);
}

function buildGeminiPrompt({ chatTranscript, jiraContext, assigneeAllowList }) {
  const assigneesBlock = assigneeAllowList.length
    ? assigneeAllowList.map((id) => `- ${id}`).join("\n")
    : "- (no assignee ids configured)";

  return [
    "HISTORY:",
    chatTranscript || "",
    "",
    "EXISTING TASKS (CONTEXT):",
    jiraContext || "No existing open tasks.",
    "",
    "ROLE:",
    "You are the AdminOps Assistant for DantaLabs.",
    "Your goal is to decide whether to create a new Jira subtask, add a comment to the existing parent issue, or ignore the message.",
    "",
    "DECISION RULES:",
    '1) If the user discusses a new topic not explicitly present in EXISTING TASKS, choose "CREATE_SUBTASK".',
    '2) If the user discusses the exact same topic as an existing task (status update, reschedule, clarification), choose "COMMENT".',
    '3) If the message is not actionable, choose "IGNORE".',
    "",
    "ASSIGNEE RULES:",
    "You MUST choose assignee_id from this allow-list and output the id exactly:",
    assigneesBlock,
    "",
    "OUTPUT CONTRACT:",
    "Return ONLY a single JSON object (no Markdown, no code fences, no extra text) that matches this schema:",
    JSON.stringify(
      {
        decision: "CREATE_SUBTASK | COMMENT | IGNORE",
        reason: "String",
        summary: "String",
        description: "String",
        priority: "High | Medium",
        assignee_id: "String",
      },
      null,
      2
    ),
    "",
    "CONSTRAINTS:",
    '- decision must be one of: "CREATE_SUBTASK", "COMMENT", "IGNORE".',
    '- priority must be exactly: "High" or "Medium".',
    "- assignee_id must be exactly one of the allow-listed ids.",
    "- Do not include any other keys.",
  ].join("\n");
}

function stripCodeFences(text) {
  if (typeof text !== "string") return "";
  return text.replace(/```json/gi, "```").replace(/```/g, "").trim();
}

function extractFirstJsonObject(text) {
  if (typeof text !== "string") return null;

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseGeminiJson(text) {
  const cleaned = stripCodeFences(text);

  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (error) {
    const extracted = extractFirstJsonObject(cleaned);
    if (!extracted) {
      return {
        ok: false,
        error: {
          type: "AI_JSON_PARSE_ERROR",
          message: "No JSON object found in model output",
        },
      };
    }

    try {
      return { ok: true, value: JSON.parse(extracted) };
    } catch (innerError) {
      return {
        ok: false,
        error: {
          type: "AI_JSON_PARSE_ERROR",
          message: "Failed to parse JSON object extracted from model output",
        },
      };
    }
  }
}

function normalizeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function safeIgnore({ reason, assigneeAllowList }) {
  return {
    decision: "IGNORE",
    reason: normalizeString(reason) || "IGNORE",
    summary: "",
    description: "",
    priority: "Medium",
    assignee_id: assigneeAllowList[0] || "",
  };
}

function validateDecisionPayload(payload, { assigneeAllowList }) {
  const errors = [];
  const allowedKeys = new Set([
    "decision",
    "reason",
    "summary",
    "description",
    "priority",
    "assignee_id",
  ]);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      errors: [{ field: "_", message: "Payload must be a JSON object" }],
    };
  }

  const extraKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length) {
    errors.push({
      field: "_",
      message: `Unexpected keys: ${extraKeys.join(", ")}`,
    });
  }

  const missingKeys = Array.from(allowedKeys).filter((key) => !(key in payload));
  if (missingKeys.length) {
    errors.push({
      field: "_",
      message: `Missing required keys: ${missingKeys.join(", ")}`,
    });
  }

  const normalizedDecision = normalizeString(payload.decision).toUpperCase();
  if (!DECISION_ALLOW_LIST.has(normalizedDecision)) {
    errors.push({
      field: "decision",
      message: `decision must be one of: ${Array.from(DECISION_ALLOW_LIST).join(", ")}`,
    });
  }

  const normalizedPriorityRaw = normalizeString(payload.priority);
  const normalizedPriority =
    normalizedPriorityRaw && normalizedPriorityRaw.toLowerCase() === "high"
      ? "High"
      : normalizedPriorityRaw && normalizedPriorityRaw.toLowerCase() === "medium"
        ? "Medium"
        : normalizedPriorityRaw;

  if (normalizedDecision !== "IGNORE") {
    if (!normalizeString(payload.reason)) errors.push({ field: "reason", message: "reason is required" });
    if (!normalizeString(payload.summary)) errors.push({ field: "summary", message: "summary is required" });
    if (!normalizeString(payload.description))
      errors.push({ field: "description", message: "description is required" });

    if (!PRIORITY_ALLOW_LIST.has(normalizedPriority)) {
      errors.push({
        field: "priority",
        message: `priority must be one of: ${Array.from(PRIORITY_ALLOW_LIST).join(", ")}`,
      });
    }

    const assigneeId = normalizeString(payload.assignee_id);
    if (!assigneeAllowList.includes(assigneeId)) {
      errors.push({
        field: "assignee_id",
        message: "assignee_id must be one of the configured allow-listed Jira account ids",
      });
    }
  } else {
    if (!normalizeString(payload.reason)) errors.push({ field: "reason", message: "reason is required" });
  }

  if (errors.length) return { ok: false, errors };

  const normalized = {
    decision: normalizedDecision,
    reason: normalizeString(payload.reason),
    summary: normalizeString(payload.summary),
    description: normalizeString(payload.description),
    priority: normalizedPriority || "Medium",
    assignee_id: normalizeString(payload.assignee_id),
  };

  if (normalized.decision === "IGNORE") {
    normalized.summary = "";
    normalized.description = "";
    normalized.priority = "Medium";
    if (!assigneeAllowList.includes(normalized.assignee_id)) {
      normalized.assignee_id = assigneeAllowList[0] || "";
    }
  }

  return { ok: true, value: normalized };
}

async function callGemini({ apiKey, modelName, prompt }) {
  const module = await import("@google/generative-ai");
  const GoogleGenerativeAI = module.GoogleGenerativeAI;

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);

  const response = result && result.response;
  if (!response || typeof response.text !== "function") return "";

  return response.text();
}

async function getAiDecision({ chatTranscript, jiraContext }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = DEFAULT_GEMINI_MODEL;
  const assigneeAllowList = getAssigneeAllowListFromEnv();

  if (!apiKey) {
    return {
      decisionPayload: safeIgnore({ reason: "GEMINI_API_KEY_MISSING", assigneeAllowList }),
      error: { type: "AI_CONFIG_ERROR", message: "GEMINI_API_KEY is missing" },
      rawText: "",
    };
  }

  const prompt = buildGeminiPrompt({ chatTranscript, jiraContext, assigneeAllowList });

  let rawText = "";
  try {
    rawText = await callGemini({ apiKey, modelName, prompt });
  } catch (error) {
    return {
      decisionPayload: safeIgnore({ reason: "GEMINI_CALL_FAILED", assigneeAllowList }),
      error: { type: "AI_CALL_ERROR", message: "Gemini call failed" },
      rawText: "",
    };
  }

  const parsed = parseGeminiJson(rawText);
  if (!parsed.ok) {
    return {
      decisionPayload: safeIgnore({ reason: "AI_OUTPUT_PARSE_FAILED", assigneeAllowList }),
      error: { ...parsed.error, rawText },
      rawText,
    };
  }

  const validated = validateDecisionPayload(parsed.value, { assigneeAllowList });
  if (!validated.ok) {
    return {
      decisionPayload: safeIgnore({ reason: "AI_OUTPUT_INVALID", assigneeAllowList }),
      error: {
        type: "AI_VALIDATION_ERROR",
        errors: validated.errors,
        rawText,
      },
      rawText,
    };
  }

  return {
    decisionPayload: validated.value,
    error: null,
    rawText,
  };
}

module.exports = {
  buildGeminiPrompt,
  parseGeminiJson,
  validateDecisionPayload,
  getAiDecision,
};
