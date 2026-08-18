import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { handleSearchRequest } from './api/search.mjs'
import { analyzeTemplate } from './api/template.mjs'
import { exportReport } from './api/export.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const port = Number(process.env.PORT || 5173)

async function readBody(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1_500_000) throw new Error('요청 본문이 너무 큽니다.')
  }
  return JSON.parse(raw || '{}')
}

async function readMultipart(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 26 * 1024 * 1024) throw new Error('업로드 파일이 너무 큽니다. 25MB 이하만 지원합니다.'); chunks.push(chunk) }
  const request = new Request(`http://${req.headers.host || 'localhost'}${req.url || '/'}`, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) })
  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('업로드할 파일을 찾지 못했습니다.')
  return { fileName: file.name || 'uploaded-file', buffer: Buffer.from(await file.arrayBuffer()) }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')
  const filePath = join(root, isProduction ? 'dist' : '', relative)
  try {
    const content = await readFile(filePath)
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
    res.writeHead(200, { 'Content-Type': `${types[extname(filePath)] || 'application/octet-stream'}; charset=utf-8` })
    res.end(content)
  } catch {
    const fallback = join(root, isProduction ? 'dist' : '', 'index.html')
    try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await readFile(fallback)) } catch { res.writeHead(404); res.end('Not found') }
  }
}

const vite = isProduction ? null : await createViteServer({ root, server: { middlewareMode: true, hmr: true } })
const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || '/', 'http://localhost').pathname
  if (req.method === 'POST' && requestPath === '/api/template') {
    try { sendJson(res, 200, await analyzeTemplate(await readMultipart(req))) }
    catch (error) { sendJson(res, 400, { ok: false, error: { code: 'UPLOAD_ERROR', message: error.message } }) }
    return
  }
  if (req.method === 'POST' && requestPath === '/api/export') {
    try { const body = await readBody(req); const file = await exportReport(body); res.writeHead(200, { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, 'Content-Length': file.buffer.length }); res.end(file.buffer) }
    catch (error) { sendJson(res, 400, { error: { code: 'EXPORT_ERROR', message: error.message } }) }
    return
  }
  if (req.method === 'POST' && requestPath === '/api/search') {
    try {
      const body = await readBody(req)
      // API 키는 여기서만 사용하며, 요청 본문이나 키 값은 로그에 출력하지 않습니다.
      sendJson(res, 200, await handleSearchRequest(body))
    } catch (error) {
      sendJson(res, error.message.includes('너무 큽니다') ? 413 : 400, { results: { openai: { ok: false, error: { code: 'BAD_REQUEST', message: error.message } }, gemini: { ok: false, error: { code: 'BAD_REQUEST', message: error.message } } }, sources: [] })
    }
    return
  }
  if (vite) return vite.middlewares(req, res, () => serveStatic(req, res))
  return serveStatic(req, res)
})

server.requestTimeout = 120_000
server.headersTimeout = 125_000
server.listen(port, () => { console.log(`Reportly server listening on http://127.0.0.1:${port}`) })
