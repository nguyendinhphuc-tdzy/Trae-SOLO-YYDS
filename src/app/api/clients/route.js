import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');

    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) query = query.ilike('display_name', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [], count: count || 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
