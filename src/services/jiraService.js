const axios = require('axios');

function sanitizeJiraLabel(name, chatId) {
  const rawName = (name ?? '').toString();
  const cleaned = rawName.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned && cleaned.length >= 3) return cleaned;

  const safeChat = (chatId ?? '').toString().replace(/[^a-zA-Z0-9]/g, '');
  if (safeChat) return `Client${safeChat.substring(0, 10)}`;

  return 'ClientUnknown';
}

function formatJiraContext(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return 'No existing open tasks.';

  return issues
    .map((issue) => {
      const key = issue.key;
      const fields = issue.fields || {};
      const type = fields.issuetype?.name || 'Unknown';
      const summary = fields.summary || '';
      const status = fields.status?.name || 'Unknown';
      return `- [${type}] [${key}] ${summary} (Status: ${status})`;
    })
    .join('\n');
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').toString().replace(/\/+$/, '');
}

function createAdfDocFromText(text) {
  const safeText = (text || '').toString();
  if (!safeText) {
    return {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    };
  }

  const lines = safeText.split(/\r?\n/);
  const content = [];
  for (const line of lines) {
    content.push({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    });
  }

  return { type: 'doc', version: 1, content };
}

function truncateText(text, maxChars) {
  const str = (text || '').toString();
  if (str.length <= maxChars) return str;
  return `${str.slice(0, maxChars - 1)}…`;
}

function buildCommentText(decisionPayload, chatTranscript) {
  const decision = decisionPayload?.decision ? decisionPayload.decision.toString() : '';
  const summary = decisionPayload?.summary ? decisionPayload.summary.toString() : '';
  const reason = decisionPayload?.reason ? decisionPayload.reason.toString() : '';
  const description = decisionPayload?.description ? decisionPayload.description.toString() : '';
  const priority = decisionPayload?.priority ? decisionPayload.priority.toString() : '';
  const assigneeId = decisionPayload?.assignee_id ? decisionPayload.assignee_id.toString() : '';

  const transcript = truncateText(chatTranscript, 3500);

  const parts = [];
  if (decision) parts.push(`decision: ${decision}`);
  if (reason) parts.push(`reason: ${reason}`);
  if (summary) parts.push(`summary: ${summary}`);
  if (priority) parts.push(`priority: ${priority}`);
  if (assigneeId) parts.push(`assignee_id: ${assigneeId}`);
  if (description) parts.push(`description:\n${description}`);
  if (transcript) parts.push(`chat_transcript:\n${transcript}`);

  return parts.join('\n\n');
}

function createJiraService(config = {}) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || process.env.JIRA_BASE_URL);
  const email = config.email || process.env.JIRA_EMAIL;
  const apiToken = config.apiToken || process.env.JIRA_API_TOKEN;
  const projectKey = config.projectKey || process.env.JIRA_PROJECT_KEY;
  const parentIssueType = config.parentIssueType || process.env.JIRA_PARENT_ISSUE_TYPE || 'Task';
  const subtaskIssueType = config.subtaskIssueType || process.env.JIRA_SUBTASK_ISSUE_TYPE || 'Sub-task';

  if (!baseUrl) throw new Error('Missing JIRA_BASE_URL');
  if (!email) throw new Error('Missing JIRA_EMAIL');
  if (!apiToken) throw new Error('Missing JIRA_API_TOKEN');
  if (!projectKey) throw new Error('Missing JIRA_PROJECT_KEY');

  const auth = Buffer.from(`${email}:${apiToken}`, 'utf8').toString('base64');
  const client = axios.create({
    baseURL: `${baseUrl}/rest/api/3`,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });

  async function getOpenIssuesByLabel(label) {
    if (!label) throw new Error('label is required');

    const jql = `labels = "${label}" AND statusCategory != Done ORDER BY created DESC`;
    let res;
    try {
      res = await client.get('/search/jql', {
        params: {
          jql,
          maxResults: 20,
          fields: 'summary,status,issuetype,parent',
        },
      });
    } catch (error) {
      res = await client.get('/search', {
        params: {
          jql,
          maxResults: 20,
          fields: 'summary,status,issuetype,parent',
        },
      });
    }

    return Array.isArray(res.data?.issues) ? res.data.issues : [];
  }

  async function findOrCreateParentIssue(label, customerName) {
    const issues = await getOpenIssuesByLabel(label);

    const parent = issues.find((issue) => {
      const fields = issue.fields || {};
      const isSubtaskType = Boolean(fields.issuetype?.subtask);
      return !isSubtaskType && !fields.parent;
    });

    if (parent?.key) return parent;

    const displayName = (customerName || 'Client').toString();
    const summary = `${displayName} - Client Master Ticket`;
    const descriptionText = `Client Master Ticket\n\nThis ticket keeps track requests from client: ${displayName}\n\nChat Label: ${label}`;

    const createRes = await client.post('/issue', {
      fields: {
        project: { key: projectKey },
        issuetype: { name: parentIssueType },
        summary,
        description: createAdfDocFromText(descriptionText),
        labels: [label],
      },
    });

    const key = createRes.data?.key;
    if (!key) throw new Error('Jira did not return created issue key');

    const fetched = await client.get(`/issue/${encodeURIComponent(key)}`, {
      params: { fields: 'summary,status,issuetype,parent' },
    });
    return fetched.data;
  }

  async function createSubtask(parentKey, decisionPayload) {
    if (!parentKey) throw new Error('parentKey is required');

    const summary = decisionPayload?.summary ? decisionPayload.summary.toString() : 'New Task';
    const label = decisionPayload?.label ? decisionPayload.label.toString() : undefined;

    const fields = {
      project: { key: projectKey },
      issuetype: { name: subtaskIssueType },
      parent: { key: parentKey },
      summary,
      description: createAdfDocFromText(decisionPayload?.description || ''),
    };

    const priorityName = decisionPayload?.priority ? decisionPayload.priority.toString() : '';
    if (priorityName) fields.priority = { name: priorityName };

    const assigneeId = decisionPayload?.assignee_id ? decisionPayload.assignee_id.toString() : '';
    if (assigneeId) fields.assignee = { accountId: assigneeId };

    if (label) fields.labels = [label];

    const createRes = await client.post('/issue', { fields });
    const key = createRes.data?.key;
    if (!key) throw new Error('Jira did not return created subtask key');

    const fetched = await client.get(`/issue/${encodeURIComponent(key)}`, {
      params: { fields: 'summary,status,issuetype,parent,assignee,priority' },
    });
    return fetched.data;
  }

  async function addComment(parentKey, decisionPayload, chatTranscript) {
    if (!parentKey) throw new Error('parentKey is required');

    const bodyText = buildCommentText(decisionPayload, chatTranscript);
    const res = await client.post(`/issue/${encodeURIComponent(parentKey)}/comment`, {
      body: createAdfDocFromText(bodyText),
    });

    return res.data;
  }

  return {
    sanitizeJiraLabel,
    formatJiraContext,
    getOpenIssuesByLabel,
    findOrCreateParentIssue,
    createSubtask,
    addComment,
    baseUrl,
  };
}

module.exports = {
  createJiraService,
  sanitizeJiraLabel,
  formatJiraContext,
  buildCommentText,
};
