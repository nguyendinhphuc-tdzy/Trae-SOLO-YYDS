const supabase = require('./supabase');

let _client;

function getClient() {
  if (_client) return _client;
  _client = supabase.createClient();
  return _client;
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  if (error.status === 409) return true;
  if (typeof error.message === 'string' && /duplicate key/i.test(error.message)) return true;
  if (typeof error.details === 'string' && /already exists/i.test(error.details)) return true;
  return false;
}

// ==========================================
// VIP Clients
// ==========================================
async function isVipClient(chatId) {
  if (!chatId) throw new Error('chatId is required');
  const sb = getClient();
  const { data, error } = await sb
    .from('vip_clients')
    .select('chat_id')
    .eq('chat_id', chatId)
    .limit(1);
  if (error) throw new Error(`vip_clients lookup failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

// ==========================================
// Idempotency
// ==========================================
async function shouldContinueForMessageId(messageId, eventFields = {}) {
  if (!messageId) throw new Error('messageId is required');
  const sb = getClient();
  const insertRow = { message_id: messageId, ...eventFields };

  const upsertResult = await sb
    .from('event_logs')
    .upsert(insertRow, { onConflict: 'message_id', ignoreDuplicates: true })
    .select('message_id');

  if (!upsertResult.error) {
    return Array.isArray(upsertResult.data) && upsertResult.data.length > 0;
  }

  const insertResult = await sb.from('event_logs').insert(insertRow).select('message_id');
  if (insertResult.error) {
    if (isUniqueViolation(insertResult.error)) return false;
    throw new Error(`event_logs insert failed: ${insertResult.error.message}`);
  }
  return true;
}

// ==========================================
// Clients
// ==========================================
async function upsertClient({ chatId, displayName, assigneeId, assigneeName }) {
  const sb = getClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('clients')
    .upsert(
      {
        chat_id: chatId,
        display_name: displayName || null,
        assignee_id: assigneeId || null,
        assignee_name: assigneeName || null,
        last_seen_at: now,
      },
      { onConflict: 'chat_id' }
    )
    .select()
    .single();
  if (error) throw new Error(`clients upsert failed: ${error.message}`);
  return data;
}

async function getClientByChatId(chatId) {
  const sb = getClient();
  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('chat_id', chatId)
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`clients lookup failed: ${error.message}`);
  return data || null;
}

async function listClients({ limit = 100, offset = 0, search = '' } = {}) {
  const sb = getClient();
  let query = sb.from('clients').select('*', { count: 'exact' }).order('last_seen_at', { ascending: false }).range(offset, offset + limit - 1);
  if (search) {
    query = query.ilike('display_name', `%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) throw new Error(`clients list failed: ${error.message}`);
  return { data: data || [], count: count || 0 };
}

async function incrementClientTicketCount(chatId) {
  const sb = getClient();
  const { error } = await sb.rpc('increment_ticket_count', { p_chat_id: chatId });
  if (error) {
    // Fallback: manual update
    const client = await getClientByChatId(chatId);
    if (client) {
      await sb.from('clients').update({ ticket_count: (client.ticket_count || 0) + 1 }).eq('chat_id', chatId);
    }
  }
}

// ==========================================
// Tickets
// ==========================================
async function createTicket({ chatId, clientName, summary, description, priority, assigneeId, assigneeName, aiReason }) {
  const sb = getClient();
  const { data, error } = await sb
    .from('tickets')
    .insert({
      chat_id: chatId,
      client_name: clientName || null,
      summary,
      description: description || null,
      priority: priority || 'Medium',
      status: 'Open',
      assignee_id: assigneeId || null,
      assignee_name: assigneeName || null,
      ai_reason: aiReason || null,
    })
    .select()
    .single();
  if (error) throw new Error(`createTicket failed: ${error.message}`);
  await incrementClientTicketCount(chatId);
  return data;
}

async function getTicketById(id) {
  const sb = getClient();
  const { data, error } = await sb.from('tickets').select('*').eq('id', id).limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(`getTicketById failed: ${error.message}`);
  return data || null;
}

async function listTickets({ status, priority, assigneeId, search, limit = 50, offset = 0 } = {}) {
  const sb = getClient();
  let query = sb.from('tickets').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (assigneeId) query = query.eq('assignee_id', assigneeId);
  if (search) query = query.or(`summary.ilike.%${search}%,description.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(`listTickets failed: ${error.message}`);
  return { data: data || [], count: count || 0 };
}

async function updateTicket(id, updates) {
  const sb = getClient();
  const { data, error } = await sb
    .from('tickets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateTicket failed: ${error.message}`);
  return data;
}

async function deleteTicket(id) {
  const sb = getClient();
  const { error } = await sb.from('tickets').delete().eq('id', id);
  if (error) throw new Error(`deleteTicket failed: ${error.message}`);
}

async function getTicketsByChatId(chatId) {
  const sb = getClient();
  const { data, error } = await sb.from('tickets').select('*').eq('chat_id', chatId).order('created_at', { ascending: false });
  if (error) throw new Error(`getTicketsByChatId failed: ${error.message}`);
  return data || [];
}

async function getOpenTicketContext(chatId) {
  const sb = getClient();
  const { data, error } = await sb
    .from('tickets')
    .select('id, summary, status, priority, created_at')
    .eq('chat_id', chatId)
    .neq('status', 'Closed')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return data || [];
}

// ==========================================
// Conversations
// ==========================================
async function createConversation({ chatId, clientName, messageId, direction, text, aiDecision, ticketId }) {
  const sb = getClient();
  const { data, error } = await sb
    .from('conversations')
    .insert({
      chat_id: chatId,
      client_name: clientName || null,
      message_id: messageId || null,
      direction: direction || 'inbound',
      text: text || null,
      ai_decision: aiDecision || null,
      ticket_id: ticketId || null,
    })
    .select()
    .single();
  if (error) throw new Error(`createConversation failed: ${error.message}`);
  return data;
}

async function getConversationById(id) {
  const sb = getClient();
  const { data, error } = await sb.from('conversations').select('*').eq('id', id).limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(`getConversationById failed: ${error.message}`);
  return data || null;
}

async function listConversations({ chatId, aiDecision, limit = 50, offset = 0 } = {}) {
  const sb = getClient();
  let query = sb
    .from('conversations')
    .select('*, tickets(id, summary, status, priority)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (chatId) query = query.eq('chat_id', chatId);
  if (aiDecision) query = query.eq('ai_decision', aiDecision);
  const { data, error, count } = await query;
  if (error) throw new Error(`listConversations failed: ${error.message}`);
  return { data: data || [], count: count || 0 };
}

async function getConversationMessages(chatId, { limit = 50, offset = 0 } = {}) {
  const sb = getClient();
  const { data, error } = await sb
    .from('conversations')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`getConversationMessages failed: ${error.message}`);
  return (data || []).reverse();
}

// ==========================================
// Analytics
// ==========================================
async function logAnalyticsEvent(eventType, metadata = {}) {
  const sb = getClient();
  const { error } = await sb.from('analytics_events').insert({ event_type: eventType, metadata });
  if (error) console.error(`logAnalyticsEvent failed: ${error.message}`);
}

async function getAnalyticsOverview({ days = 7 } = {}) {
  const sb = getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const [convResult, ticketResult, clientResult] = await Promise.all([
    sb.from('conversations').select('*', { count: 'exact' }).gte('created_at', sinceStr),
    sb.from('tickets').select('*', { count: 'exact' }).gte('created_at', sinceStr),
    sb.from('clients').select('*', { count: 'exact' }).gte('last_seen_at', sinceStr),
  ]);

  const [byDecision, byPriority, byStatus] = await Promise.all([
    sb.from('conversations').select('ai_decision').gte('created_at', sinceStr),
    sb.from('tickets').select('priority').gte('created_at', sinceStr),
    sb.from('tickets').select('status').gte('created_at', sinceStr),
  ]);

  const decisionCounts = {};
  (byDecision.data || []).forEach((r) => {
    const k = r.ai_decision || 'unknown';
    decisionCounts[k] = (decisionCounts[k] || 0) + 1;
  });

  const priorityCounts = {};
  (byPriority.data || []).forEach((r) => {
    priorityCounts[r.priority || 'unknown'] = (priorityCounts[r.priority || 'unknown'] || 0) + 1;
  });

  const statusCounts = {};
  (byStatus.data || []).forEach((r) => {
    statusCounts[r.status || 'unknown'] = (statusCounts[r.status || 'unknown'] || 0) + 1;
  });

  return {
    totalConversations: convResult.count || 0,
    totalTickets: ticketResult.count || 0,
    activeClients: clientResult.count || 0,
    byDecision: decisionCounts,
    byPriority: priorityCounts,
    byStatus: statusCounts,
    days,
  };
}

async function getAnalyticsTimeline({ days = 7 } = {}) {
  const sb = getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const { data, error } = await sb
    .from('conversations')
    .select('created_at, ai_decision')
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getAnalyticsTimeline failed: ${error.message}`);

  const daily = {};
  for (const row of (data || [])) {
    const d = row.created_at.split('T')[0];
    if (!daily[d]) daily[d] = { date: d, conversations: 0, subtasks: 0, comments: 0, ignores: 0 };
    daily[d].conversations += 1;
    if (row.ai_decision === 'CREATE_SUBTASK') daily[d].subtasks += 1;
    else if (row.ai_decision === 'COMMENT') daily[d].comments += 1;
    else if (row.ai_decision === 'IGNORE') daily[d].ignores += 1;
  }

  return Object.values(daily);
}

// ==========================================
// Settings
// ==========================================
async function getSetting(key) {
  const sb = getClient();
  const { data, error } = await sb.from('settings').select('value').eq('key', key).limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(`getSetting failed: ${error.message}`);
  return data ? data.value : null;
}

async function setSetting(key, value) {
  const sb = getClient();
  const { error } = await sb
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`setSetting failed: ${error.message}`);
}

async function getAllSettings() {
  const sb = getClient();
  const { data, error } = await sb.from('settings').select('*');
  if (error) throw new Error(`getAllSettings failed: ${error.message}`);
  const settings = {};
  (data || []).forEach((row) => { settings[row.key] = row.value; });
  return settings;
}

module.exports = {
  getClient,
  isVipClient,
  shouldContinueForMessageId,
  upsertClient,
  getClientByChatId,
  listClients,
  createTicket,
  getTicketById,
  listTickets,
  updateTicket,
  deleteTicket,
  getTicketsByChatId,
  getOpenTicketContext,
  createConversation,
  getConversationById,
  listConversations,
  getConversationMessages,
  logAnalyticsEvent,
  getAnalyticsOverview,
  getAnalyticsTimeline,
  getSetting,
  setSetting,
  getAllSettings,
};
