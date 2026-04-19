'use strict'

/**
 * Vercel Serverless — Maya KB proxy vers Supabase.
 * Toutes les opérations passent par la service_role key (env var).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ataxqfqlprndcjisepbn.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const REST = `${SUPABASE_URL}/rest/v1`

const HEADERS = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── get_learnings ────────────────────────────────────────────────────────────

async function getLearnings(agentId, maxTokens = 2000) {
  const url = `${REST}/knowledge?agent_id=eq.${enc(agentId)}&source=like.learning:*&order=created_at.desc&limit=30`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return ''

  const rows = await res.json()
  if (!rows || !rows.length) return ''

  const byCategory = { correction: [], preference: [], knowledge: [] }
  for (const r of rows) {
    const cat = (r.source || '').replace('learning:', '') || 'knowledge'
    if (byCategory[cat]) byCategory[cat].push(r.content)
    else byCategory.knowledge.push(r.content)
  }

  let text = '\n---\n## APPRENTISSAGES PRÉCÉDENTS\n'
  let budget = maxTokens * 4 - text.length

  const labels = { correction: 'Corrections apprises', preference: 'Préférences', knowledge: 'Connaissances acquises' }
  for (const [cat, items] of Object.entries(byCategory)) {
    if (!items.length) continue
    const header = `\n### ${labels[cat] || cat}\n`
    if (budget < header.length + 20) break
    text += header
    budget -= header.length
    for (const item of items) {
      const line = `- ${item}\n`
      if (budget < line.length) break
      text += line
      budget -= line.length
    }
  }
  text += '---\n'
  return text
}

// ── reflect ──────────────────────────────────────────────────────────────────

async function reflect(agentId, learnings) {
  if (!Array.isArray(learnings) || !learnings.length) return { saved: 0, skipped: 0 }

  let saved = 0, skipped = 0

  for (const l of learnings.slice(0, 10)) {
    const category = l.category || 'knowledge'
    const content = (l.content || '').trim()
    if (!content || content.length < 10) { skipped++; continue }

    // Dedup
    const needle = content.substring(0, 60).replace(/[%_'"]/g, '')
    try {
      const checkUrl = `${REST}/knowledge?agent_id=eq.${enc(agentId)}&source=like.learning:*&content=ilike.*${enc(needle)}*&limit=1`
      const checkRes = await fetch(checkUrl, { headers: HEADERS })
      if (checkRes.ok) {
        const existing = await checkRes.json()
        if (existing && existing.length > 0) { skipped++; continue }
      }
    } catch {}

    try {
      const row = {
        id: uid(),
        agent_id: agentId,
        content,
        source: `learning:${category}`,
        topic: l.topic || category,
        tags: ['learning', category, ...(l.tags || [])],
      }
      const res = await fetch(`${REST}/knowledge`, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify([row]),
      })
      if (res.ok) saved++
    } catch {}
  }

  return { saved, skipped }
}

// ── profile ──────────────────────────────────────────────────────────────────

async function profile(agentId) {
  try {
    const lUrl = `${REST}/knowledge?agent_id=eq.${enc(agentId)}&source=like.learning:*&select=source,created_at&order=created_at.desc`
    const lRes = await fetch(lUrl, { headers: HEADERS })
    const learnings = lRes.ok ? await lRes.json() : []

    const byCategory = {}
    for (const r of (learnings || [])) {
      const cat = (r.source || '').replace('learning:', '') || 'knowledge'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }

    return {
      agent_id: agentId,
      total_learnings: (learnings || []).length,
      by_category: byCategory,
      last_learning: learnings?.[0]?.created_at || null,
    }
  } catch {
    return { agent_id: agentId, total_learnings: 0, by_category: {} }
  }
}

function enc(s) { return encodeURIComponent(s) }

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })

  const { action, agent_id } = req.body || {}
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  try {
    switch (action) {
      case 'get_learnings': {
        const text = await getLearnings(agent_id, req.body.max_tokens || 2000)
        return res.json({ ok: true, learnings_text: text })
      }
      case 'reflect': {
        const result = await reflect(agent_id, req.body.learnings || [])
        return res.json({ ok: true, ...result })
      }
      case 'profile': {
        const data = await profile(agent_id)
        return res.json({ ok: true, ...data })
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
