import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
  try {
    const { chatId } = params;
    const [clientResult, ticketsResult] = await Promise.all([
      supabase.from('clients').select('*').eq('chat_id', chatId).limit(1).single(),
      supabase.from('tickets').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      client: clientResult.data || null,
      tickets: ticketsResult.data || [],
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
