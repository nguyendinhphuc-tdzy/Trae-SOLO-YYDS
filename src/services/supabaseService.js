let supabaseClient;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      !supabaseUrl ? "SUPABASE_URL" : null,
      !supabaseKey ? "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)" : null,
    ].filter(Boolean);
    throw new Error(`Missing required Supabase env: ${missing.join(", ")}`);
  }

  const { createClient } = require("@supabase/supabase-js");

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  return supabaseClient;
}

async function isVipClient(chatId) {
  if (!chatId) throw new Error("chatId is required");

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("vip_clients")
    .select("chat_id")
    .eq("chat_id", chatId)
    .limit(1);

  if (error) {
    throw new Error(`Supabase vip_clients lookup failed: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  if (error.status === 409) return true;
  if (typeof error.message === "string" && /duplicate key/i.test(error.message))
    return true;
  if (typeof error.details === "string" && /already exists/i.test(error.details))
    return true;
  return false;
}

async function shouldContinueForMessageId(messageId, eventFields = {}) {
  if (!messageId) throw new Error("messageId is required");

  const supabase = getSupabaseClient();
  const insertRow = {
    message_id: messageId,
    ...eventFields,
  };

  const upsertResult = await supabase
    .from("event_logs")
    .upsert(insertRow, { onConflict: "message_id", ignoreDuplicates: true })
    .select("message_id");

  if (!upsertResult.error) {
    return Array.isArray(upsertResult.data) && upsertResult.data.length > 0;
  }

  const insertResult = await supabase
    .from("event_logs")
    .insert(insertRow)
    .select("message_id");

  if (insertResult.error) {
    if (isUniqueViolation(insertResult.error)) return false;
    throw new Error(`Supabase event_logs insert failed: ${insertResult.error.message}`);
  }

  return true;
}

module.exports = {
  getSupabaseClient,
  isVipClient,
  shouldContinueForMessageId,
};
