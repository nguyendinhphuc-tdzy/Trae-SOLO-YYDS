const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WA_AUTH_PATH",
  "GEMINI_API_KEY",
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_PROJECT_KEY",
  "JIRA_ASSIGNEE_DANI_ID",
  "JIRA_ASSIGNEE_SAM_ID",
  "JIRA_ASSIGNEE_JAY_ID",
];

function validateEnv(keys = REQUIRED_ENV_KEYS) {
  const missingKeys = keys.filter((key) => {
    const value = process.env[key];
    return typeof value !== "string" || value.trim() === "";
  });

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(", ")}`
    );
  }
}

module.exports = {
  REQUIRED_ENV_KEYS,
  validateEnv,
};
