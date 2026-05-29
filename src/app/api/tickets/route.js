import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assigneeId = searchParams.get('assigneeId');
    const search = searchParams.get('search');

    let query = supabase
      .from('tickets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    if (search) query = query.or(`summary.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [], count: count || 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { chatId, clientName, summary, description, priority, assigneeId, assigneeName, aiReason } = body;

    const { data, error } = await supabase
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

    if (error) throw error;

    // increment client ticket count
    if (chatId) {
      await supabase.rpc('increment_ticket_count', { p_chat_id: chatId }).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
