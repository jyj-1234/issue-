export async function searchReports({ input, reportType, period, sources, openaiKey, geminiKey, templatePrompt, providers, maxSources }) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, reportType, period, sources, openaiKey, geminiKey, templatePrompt, providers, maxSources }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || '검색 요청에 실패했습니다.')
  return payload
}

export async function analyzeTemplate(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/template', { method: 'POST', body: formData })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || '양식 분석 요청에 실패했습니다.')
  return payload
}

export async function downloadReport({ format, markdown, title }) {
  const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, markdown, title }) })
  if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error?.message || '보고서 다운로드에 실패했습니다.') }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const fileName = encoded ? decodeURIComponent(encoded) : `reportly-report.${format}`
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url)
}
