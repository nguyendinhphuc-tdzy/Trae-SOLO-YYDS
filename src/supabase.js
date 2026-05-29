const { createClient } = require('@supabase/supabase-js');

let _client;

function createSupabaseClient() {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  _client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  return _client;
}

module.exports = { createClient: createSupabaseClient };
