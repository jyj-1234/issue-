const REQUEST_TIMEOUT_MS = 120_000
const MAX_SOURCES = 20

const SOURCE_DOMAINS = {
  '정부·공공기관': ['go.kr', 'gov.kr', 'korea.kr'],
  '연구·학술': ['pubmed.ncbi.nlm.nih.gov', 'nature.com', 'sciencedirect.com', 'springer.com', 'ac.kr'],
  '뉴스': ['yna.co.kr', 'reuters.com', 'apnews.com', 'bbc.com', 'newsis.com', 'hani.co.kr', 'khan.co.kr'],
  '기업': ['samsung.com', 'lg.com', 'sk.com', 'hyundai.com', 'naver.com', 'kakaocorp.com'],
  '국제기구': ['un.org', 'oecd.org', 'worldbank.org', 'imf.org', 'who.int', 'wto.org'],
}

function promptFor({ input, reportType, period, sources, templatePrompt, maxSources }) {
  const formatInstruction = reportType === '보고용 1장 페이퍼'
    ? '1페이지 안에 들어갈 수 있도록 간결한 개조식으로 작성하세요. 제목, 핵심 요약(3줄 이내), 현황, 주요 수치·근거, 대응방향, 기대효과, 시사점 순서로 구성하세요.'
    : '분석 보고서 형식으로 작성하세요. 제목, 핵심 요약, 현황, 문제점, 대응방향, 효과성, 시사점 순서의 명확한 대항목을 사용하고 각 항목을 충분히 설명하세요.'
  return `당신은 정책·이슈 대응 보고서 작성자입니다. 아래 주제에 대해 최신 웹 자료를 검색하고 한국어 보고서 초안을 작성하세요.

주제 또는 기사 본문:
${input}

검색 조건:
- 검색 기간: ${period}. 자료의 발행일과 최신성을 반드시 고려하세요.
- 우선 검색 소스 유형: ${sources.join(', ')}. 이 유형의 신뢰할 수 있는 공식·전문 자료를 우선하세요.
- 최대 참고 출처 수: ${maxSources}개.

출력 형식:
- 보고서 유형: ${reportType}
- ${formatInstruction}
- 마지막에 참고 출처를 제목과 URL 형식으로 정리하세요.

각 사실·수치·주장 뒤에는 검색 결과의 근거를 인용하세요. 검색 도구가 제공하는 인용을 임의로 만들지 말고, 확인되지 않은 내용은 추정하지 마세요. 참고 출처 목록은 제목과 URL 형식으로 정리하세요.
${templatePrompt ? `\n\n[업로드 양식 반영 지침]\n${templatePrompt}` : ''}`
}

function withTimeout() {
  return AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : (() => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS).unref?.()
    return controller.signal
  })()
}

function errorResult(code, message) { return { ok: false, error: { code, message } } }

function responseError(provider, response, body) {
  const detail = body?.error?.message || body?.message || `${provider} API 요청이 실패했습니다. (HTTP ${response.status})`
  const code = response.status === 401 || response.status === 403 ? 'INVALID_API_KEY' : response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR'
  return errorResult(code, detail)
}

function addCitationMarkers(text, annotations, sources) {
  let output = text || ''
  const insertions = []
  for (const annotation of annotations || []) {
    const citation = annotation.url_citation || annotation
    const url = citation.url
    if (!url) continue
    const sourceIndex = sources.push({ url, title: citation.title || url }) - 1
    const end = Number(citation.end_index ?? annotation.end_index)
    insertions.push({ end: Number.isFinite(end) ? end : output.length, marker: `[[CITE_${sourceIndex}]]` })
  }
  for (const insertion of insertions.sort((a, b) => b.end - a.end)) output = output.slice(0, insertion.end) + insertion.marker + output.slice(insertion.end)
  return output
}

function extractOpenAI(body) {
  const sources = []
  let text = ''
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) text += addCitationMarkers(content.text, content.annotations, sources)
    }
  }
  if (!text && body.output_text) text = body.output_text
  return { text, sources }
}

async function callOpenAI(apiKey, request) {
  if (!apiKey?.trim()) return errorResult('NO_API_KEY', 'OpenAI API 키가 입력되지 않았습니다.')
  const domains = [...new Set(request.sources.flatMap((source) => SOURCE_DOMAINS[source] || []))]
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: withTimeout(), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.6-luna', input: promptFor(request), tools: [{ type: 'web_search', ...(domains.length ? { filters: { allowed_domains: domains } } : {}) }], max_output_tokens: 5000 }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) return responseError('OpenAI', response, body)
  return { ok: true, ...extractOpenAI(body) }
}

function addGeminiMarkers(text, metadata, sources) {
  const chunks = metadata?.groundingChunks || []
  const supports = metadata?.groundingSupports || []
  const refs = chunks.map((chunk) => chunk.web).filter((web) => web?.uri).map((web) => sources.push({ url: web.uri, title: web.title || web.uri }) - 1)
  let output = text || ''
  const insertions = []
  for (const support of supports) {
    const end = Number(support.segment?.endIndex)
    const markers = (support.groundingChunkIndices || []).map((index) => refs[index]).filter((index) => index !== undefined).map((index) => `[[CITE_${index}]]`).join('')
    if (markers && Number.isFinite(end)) insertions.push({ end, marker: markers })
  }
  for (const insertion of insertions.sort((a, b) => b.end - a.end)) output = output.slice(0, insertion.end) + insertion.marker + output.slice(insertion.end)
  return output
}

function extractGemini(body) {
  const candidate = body.candidates?.[0]
  const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('')
  const metadata = candidate?.groundingMetadata || candidate?.grounding_metadata
  const sources = []
  return { text: addGeminiMarkers(text, metadata, sources), sources }
}

async function callGemini(apiKey, request) {
  if (!apiKey?.trim()) return errorResult('NO_API_KEY', 'Gemini API 키가 입력되지 않았습니다.')
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
  const response = await fetch(url, {
    method: 'POST', signal: withTimeout(), headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: promptFor(request) }] }], tools: [{ google_search: {} }] }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) return responseError('Gemini', response, body)
  return { ok: true, ...extractGemini(body) }
}

function canonicalUrl(raw) {
  try {
    const url = new URL(raw)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch { return raw.trim().replace(/#.*$/, '').replace(/\/$/, '') }
}

function mergeCitations(results, maxSources) {
  const sourceMap = new Map(); const sources = []
  const sourceNumber = (source) => { const url = canonicalUrl(source.url); if (!sourceMap.has(url) && sources.length < maxSources) { sourceMap.set(url, sources.length + 1); sources.push({ title: source.title || url, url }) } return sourceMap.get(url) }
  const output = {}
  for (const [provider, result] of Object.entries(results)) {
    if (!result.ok) { output[provider] = result; continue }
    const localNumbers = result.sources.map(sourceNumber)
    const text = result.text.replace(/\[\[CITE_(\d+)\]\]/g, (_, index) => localNumbers[Number(index)] ? `[${localNumbers[Number(index)]}]` : '')
    output[provider] = { ...result, text, sources: result.sources.map((source, index) => ({ ...source, url: canonicalUrl(source.url), number: localNumbers[index] })).filter((source) => source.number) }
  }
  return { results: output, sources }
}

export async function handleSearchRequest(requestBody) {
  const maxSources = Math.min(MAX_SOURCES, Math.max(1, Number(requestBody.maxSources) || MAX_SOURCES))
  const providers = Array.isArray(requestBody.providers) && requestBody.providers.length ? requestBody.providers : ['openai', 'gemini']
  const request = { input: String(requestBody.input || '').slice(0, 10000), reportType: requestBody.reportType || '보고용 1장 페이퍼', period: requestBody.period || '최근 30일', sources: Array.isArray(requestBody.sources) ? requestBody.sources : [], templatePrompt: String(requestBody.templatePrompt || '').slice(0, 65000), maxSources }
  if (!request.input.trim()) return { results: { openai: errorResult('INVALID_INPUT', '검색할 키워드 또는 본문이 필요합니다.'), gemini: errorResult('INVALID_INPUT', '검색할 키워드 또는 본문이 필요합니다.') }, sources: [] }
  const settled = await Promise.allSettled([providers.includes('openai') ? callOpenAI(requestBody.openaiKey, request) : Promise.resolve(errorResult('NOT_SELECTED', 'OpenAI 검색을 선택하지 않았습니다.')), providers.includes('gemini') ? callGemini(requestBody.geminiKey, request) : Promise.resolve(errorResult('NOT_SELECTED', 'Gemini 검색을 선택하지 않았습니다.'))])
  const raw = { openai: settled[0].status === 'fulfilled' ? settled[0].value : errorResult('TIMEOUT_OR_EXCEPTION', 'OpenAI 검색 중 시간 초과 또는 예외가 발생했습니다.'), gemini: settled[1].status === 'fulfilled' ? settled[1].value : errorResult('TIMEOUT_OR_EXCEPTION', 'Gemini 검색 중 시간 초과 또는 예외가 발생했습니다.') }
  return mergeCitations(raw, maxSources)
}
