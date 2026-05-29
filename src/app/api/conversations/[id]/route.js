import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const { data, error } = await supabase
      .from('conversations')
      .select('*, tickets(id, summary, status, priority)')
      .eq('id', id)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
