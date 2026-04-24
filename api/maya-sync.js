'use strict'

/**
 * Vercel Serverless — Sync Maya (feedbacks + reports) vers Supabase.
 * Toutes les opérations passent par la service_role key (env var).
 *
 * Actions :
 *   - list_feedbacks        -> { ok, items: [...] }
 *   - save_feedback         -> { ok, id }       (upsert via id)
 *   - update_feedback       -> { ok }           (changement statut / text)
 *   - delete_feedback       -> { ok }
 *   - list_reports          -> { ok, items: [...] (sans results_json) }
 *   - get_report            -> { ok, report: {...} avec results_json }
 *   - save_report           -> { ok, id }
 *   - delete_report         -> { ok }
 *   - clear_reports         -> { ok, deleted }
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ataxqfqlprndcjisepbn.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const REST = `${SUPABASE_URL}/rest/v1`

const HEADERS = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

function enc(s) { return encodeURIComponent(String(s)) }
function nowIso() { return new Date().toISOString() }
function sanitizeClient(id) { return (id || 'default').toString().slice(0, 64) }

// ── FEEDBACKS ───────────────────────────────────────────────────────────────

async function listFeedbacks(clientId) {
  const url = `${REST}/maya_feedbacks?client_id=eq.${enc(clientId)}&order=created_at.desc&limit=500`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Supabase list_feedbacks ${res.status}`)
  return await res.json()
}

async function saveFeedback(clientId, fb) {
  if (!fb || !fb.id) throw new Error('feedback.id required')
  const row = {
    id: String(fb.id),
    client_id: clientId,
    scope: fb.scope === 'global' ? 'global' : 'line',
    key_field: fb.key_field || null,
    audit_value: fb.audit_value || null,
    vt_value: fb.vt_value || null,
    conformity_status: fb.conformity_status || null,
    commentaire: fb.commentaire || null,
    category: fb.category || null,
    feedback_text: String(fb.feedback_text || '').slice(0, 4000),
    status: fb.status || 'pending',
    snapshot: fb.snapshot || null,
    created_at: fb.created_at || nowIso(),
    updated_at: nowIso(),
  }
  // Upsert via Prefer: resolution=merge-duplicates
  const res = await fetch(`${REST}/maya_feedbacks`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Supabase save_feedback ${res.status}: ${txt}`)
  }
  return row.id
}

async function updateFeedback(clientId, id, patch) {
  if (!id) throw new Error('id required')
  const body = { updated_at: nowIso() }
  if (patch.status !== undefined) body.status = patch.status
  if (patch.feedback_text !== undefined) body.feedback_text = String(patch.feedback_text).slice(0, 4000)
  if (patch.category !== undefined) body.category = patch.category
  const url = `${REST}/maya_feedbacks?id=eq.${enc(id)}&client_id=eq.${enc(clientId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase update_feedback ${res.status}`)
}

async function deleteFeedback(clientId, id) {
  if (!id) throw new Error('id required')
  const url = `${REST}/maya_feedbacks?id=eq.${enc(id)}&client_id=eq.${enc(clientId)}`
  const res = await fetch(url, { method: 'DELETE', headers: HEADERS })
  if (!res.ok) throw new Error(`Supabase delete_feedback ${res.status}`)
}

// ── REPORTS ─────────────────────────────────────────────────────────────────

async function listReports(clientId, limit) {
  const cols = 'id,client_id,title,audit_filename,vt_filename,score,total,conformes,oranges,rouges,manquants,export_file,date_fr,time_fr,created_at,metadata'
  const lim = Math.max(1, Math.min(500, Number(limit) || 100))
  const url = `${REST}/maya_reports?client_id=eq.${enc(clientId)}&select=${enc(cols)}&order=created_at.desc&limit=${lim}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Supabase list_reports ${res.status}`)
  return await res.json()
}

async function getReport(clientId, id) {
  if (!id) throw new Error('id required')
  const url = `${REST}/maya_reports?id=eq.${enc(id)}&client_id=eq.${enc(clientId)}&limit=1`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Supabase get_report ${res.status}`)
  const rows = await res.json()
  return rows && rows[0] ? rows[0] : null
}

async function saveReport(clientId, rep) {
  if (!rep || !rep.id) throw new Error('report.id required')
  const row = {
    id: String(rep.id),
    client_id: clientId,
    title: String(rep.title || rep.dossier || 'Analyse').slice(0, 200),
    audit_filename: rep.audit_filename || null,
    vt_filename: rep.vt_filename || null,
    score: Number.isFinite(rep.score) ? Math.round(rep.score) : null,
    total: Number.isFinite(rep.total) ? rep.total : null,
    conformes: Number.isFinite(rep.conformes) ? rep.conformes : null,
    oranges: Number.isFinite(rep.oranges) ? rep.oranges : null,
    rouges: Number.isFinite(rep.rouges) ? rep.rouges : null,
    manquants: Number.isFinite(rep.manquants) ? rep.manquants : null,
    export_file: rep.export_file || null,
    results_json: rep.results_json || null,
    metadata: rep.metadata || null,
    date_fr: rep.date_fr || null,
    time_fr: rep.time_fr || null,
    created_at: rep.created_at || nowIso(),
  }
  const res = await fetch(`${REST}/maya_reports`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Supabase save_report ${res.status}: ${txt}`)
  }
  return row.id
}

async function updateReportExport(clientId, id, exportFile) {
  if (!id) throw new Error('id required')
  const url = `${REST}/maya_reports?id=eq.${enc(id)}&client_id=eq.${enc(clientId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ export_file: exportFile || null }),
  })
  if (!res.ok) throw new Error(`Supabase update_report_export ${res.status}`)
}

async function deleteReport(clientId, id) {
  if (!id) throw new Error('id required')
  const url = `${REST}/maya_reports?id=eq.${enc(id)}&client_id=eq.${enc(clientId)}`
  const res = await fetch(url, { method: 'DELETE', headers: HEADERS })
  if (!res.ok) throw new Error(`Supabase delete_report ${res.status}`)
}

async function clearReports(clientId) {
  const url = `${REST}/maya_reports?client_id=eq.${enc(clientId)}`
  const res = await fetch(url, { method: 'DELETE', headers: { ...HEADERS, 'Prefer': 'return=minimal' } })
  if (!res.ok) throw new Error(`Supabase clear_reports ${res.status}`)
}

// ── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })

  const body = req.body || {}
  const action = body.action
  const clientId = sanitizeClient(body.client_id || 'default')

  try {
    switch (action) {
      case 'list_feedbacks': {
        const items = await listFeedbacks(clientId)
        return res.json({ ok: true, items })
      }
      case 'save_feedback': {
        const id = await saveFeedback(clientId, body.feedback || {})
        return res.json({ ok: true, id })
      }
      case 'update_feedback': {
        await updateFeedback(clientId, body.id, body.patch || {})
        return res.json({ ok: true })
      }
      case 'delete_feedback': {
        await deleteFeedback(clientId, body.id)
        return res.json({ ok: true })
      }
      case 'list_reports': {
        const items = await listReports(clientId, body.limit)
        return res.json({ ok: true, items })
      }
      case 'get_report': {
        const report = await getReport(clientId, body.id)
        return res.json({ ok: true, report })
      }
      case 'save_report': {
        const id = await saveReport(clientId, body.report || {})
        return res.json({ ok: true, id })
      }
      case 'update_report_export': {
        await updateReportExport(clientId, body.id, body.export_file)
        return res.json({ ok: true })
      }
      case 'delete_report': {
        await deleteReport(clientId, body.id)
        return res.json({ ok: true })
      }
      case 'clear_reports': {
        await clearReports(clientId)
        return res.json({ ok: true })
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}
