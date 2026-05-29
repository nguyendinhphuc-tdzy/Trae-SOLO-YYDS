import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const [convResult, ticketResult, clientResult] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact' }).gte('created_at', sinceStr),
      supabase.from('tickets').select('*', { count: 'exact' }).gte('created_at', sinceStr),
      supabase.from('clients').select('*', { count: 'exact' }).gte('last_seen_at', sinceStr),
    ]);

    const [byDecision, byPriority, byStatus] = await Promise.all([
      supabase.from('conversations').select('ai_decision').gte('created_at', sinceStr),
      supabase.from('tickets').select('priority').gte('created_at', sinceStr),
      supabase.from('tickets').select('status').gte('created_at', sinceStr),
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

    // Timeline
    const { data: timelineRaw } = await supabase
      .from('conversations')
      .select('created_at, ai_decision')
      .gte('created_at', sinceStr)
      .order('created_at', { ascending: true });

    const daily = {};
    for (const row of (timelineRaw || [])) {
      const d = row.created_at.split('T')[0];
      if (!daily[d]) daily[d] = { date: d, conversations: 0, subtasks: 0, ignores: 0 };
      daily[d].conversations += 1;
      if (row.ai_decision === 'CREATE_SUBTASK') daily[d].subtasks += 1;
      else if (row.ai_decision === 'IGNORE') daily[d].ignores += 1;
    }

    return NextResponse.json({
      totalConversations: convResult.count || 0,
      totalTickets: ticketResult.count || 0,
      activeClients: clientResult.count || 0,
      byDecision: decisionCounts,
      byPriority: priorityCounts,
      byStatus: statusCounts,
      timeline: Object.values(daily),
      days,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
