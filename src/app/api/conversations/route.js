import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const chatId = searchParams.get('chatId');
    const aiDecision = searchParams.get('aiDecision');

    let query = supabase
      .from('conversations')
      .select('*, tickets(id, summary, status, priority)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (chatId) query = query.eq('chat_id', chatId);
    if (aiDecision) query = query.eq('ai_decision', aiDecision);

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
    const { chatId, clientName, messageId, direction, text, aiDecision, ticketId } = body;

    const { data, error } = await supabase
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

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
