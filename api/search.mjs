import { handleSearchRequest } from '../server/api/search.mjs'

export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' } })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    res.status(200).json(await handleSearchRequest(body))
  } catch (error) {
    res.status(400).json({
      results: {
        openai: { ok: false, error: { code: 'BAD_REQUEST', message: error.message || '검색 요청을 처리하지 못했습니다.' } },
        gemini: { ok: false, error: { code: 'BAD_REQUEST', message: error.message || '검색 요청을 처리하지 못했습니다.' } },
      },
      sources: [],
    })
  }
}
