import { exportReport } from '../server/api/export.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' } })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const file = await exportReport(body)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
    res.setHeader('Content-Length', file.buffer.length)
    res.status(200).send(file.buffer)
  } catch (error) {
    res.status(400).json({ error: { code: 'EXPORT_ERROR', message: error.message || '보고서 다운로드에 실패했습니다.' } })
  }
}
