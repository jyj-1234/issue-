import { analyzeTemplate } from '../server/api/template.mjs'

export const config = { api: { bodyParser: false }, maxDuration: 120 }

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' } })
    return
  }

  try {
    const rawBody = await readBody(req)
    const request = new Request('http://localhost/api/template', {
      method: 'POST',
      headers: req.headers,
      body: rawBody,
    })
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('업로드할 파일을 찾지 못했습니다.')
    const result = await analyzeTemplate({ fileName: file.name || 'uploaded-file', buffer: Buffer.from(await file.arrayBuffer()) })
    res.status(result.ok ? 200 : 400).json(result)
  } catch (error) {
    res.status(400).json({ ok: false, error: { code: 'UPLOAD_ERROR', message: error.message || '파일을 분석하지 못했습니다.' } })
  }
}
