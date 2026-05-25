function formatSubtaskCreatedMessage(input) {
  const taskTitle = (input?.taskTitle || input?.summary || "New Task").toString();
  const assigneeName = (input?.assigneeName || "Team").toString();
  const jiraKey = (input?.jiraKey || "").toString();
  const jiraBaseUrl = (input?.jiraBaseUrl || process.env.JIRA_BASE_URL || "")
    .toString()
    .replace(/\/+$/, "");
  const reason = (input?.reason || "").toString();
  const priority = (input?.priority || "").toString();

  const link = jiraKey
    ? `${jiraBaseUrl ? jiraBaseUrl : "https://your-jira-domain.atlassian.net"}/browse/${jiraKey}`
    : "";

  const lines = [
    "NEW SUBTASK CREATED",
    "",
    `Task: ${taskTitle}`,
    `Assignee: ${assigneeName}`,
  ];

  if (jiraKey) lines.push(`Key: ${jiraKey}`);
  if (link) lines.push(`Link: ${link}`);
  if (priority) lines.push(`Priority: ${priority}`);
  if (reason) lines.push("", `Reason: ${reason}`);

  return lines.join("\n");
}

module.exports = { formatSubtaskCreatedMessage };
