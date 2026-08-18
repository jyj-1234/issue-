const STORAGE_KEY = 'reportly.savedReports.v1'

function readSavedReports() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function safeUrl(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.toString() : '#' } catch { return '#' }
}

export function loadSavedReports() { return readSavedReports() }

export function saveReport(report) {
  const saved = { ...report, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, savedAt: new Date().toISOString() }
  const next = [saved, ...readSavedReports()].slice(0, 30)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return saved
}

export function openReportInNewTab(report) {
  const tab = window.open('', '_blank')
  if (!tab) throw new Error('새 탭을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.')
  const sourceLinks = (report.references || []).map((source, index) => `<li><a href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noreferrer">[${index + 1}] ${escapeHtml(source.title || source.url)}<small>${escapeHtml(source.url)}</small></a></li>`).join('')
  tab.document.write(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title || 'Reportly 보고서')}</title><style>body{margin:0;background:#f5f7fb;color:#1e293b;font-family:Arial,'Noto Sans KR',sans-serif}.page{max-width:860px;margin:40px auto;padding:48px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 10px 30px #0f172a0d}.eyebrow{color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.12em}.meta{color:#64748b;font-size:13px;margin:10px 0 30px}.content{white-space:pre-wrap;line-height:1.85;font-size:15px;border-top:1px solid #e2e8f0;padding-top:24px}.sources{border-top:1px solid #e2e8f0;margin-top:32px;padding-top:20px}.sources h2{font-size:16px}.sources ul{padding-left:20px}.sources li{margin:8px 0}.sources a{color:#2563eb;text-decoration:none}.sources small{display:block;color:#94a3b8;font-size:11px;margin-top:3px;word-break:break-all}@media(max-width:600px){.page{margin:0;padding:25px;border:0;box-shadow:none}}</style></head><body><main class="page"><div class="eyebrow">REPORTLY / SAVED REPORT</div><h1>${escapeHtml(report.title || '이슈 대응 보고서')}</h1><div class="meta">${escapeHtml(report.reportType || '')} · ${escapeHtml(report.period || '')} · 저장 ${escapeHtml(new Date(report.savedAt || Date.now()).toLocaleString('ko-KR'))}</div><section class="content">${escapeHtml(report.combinedText || '')}</section>${sourceLinks ? `<section class="sources"><h2>참고 출처</h2><ul>${sourceLinks}</ul></section>` : ''}</main></body></html>`)
  tab.document.close()
  tab.focus()
}
