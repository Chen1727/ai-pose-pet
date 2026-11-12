import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const port = Number(process.env.API_PORT || 3000)
const maxBodyBytes = Number(process.env.PROXY_MAX_BODY_BYTES || 50 * 1024 * 1024)
const defaultAllowedHosts = [
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'ark.cn-beijing.volces.com',
]
const configuredHosts = (process.env.PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
const allowedHosts = configuredHosts.length ? configuredHosts : defaultAllowedHosts

function isAllowedHost(hostname) {
  if (allowedHosts.includes('*')) return true
  const host = hostname.toLowerCase()
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(new Error(`Request body exceeds ${maxBodyBytes} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleProxy(req, res) {
  const targetHeader = req.headers['x-target-url']
  const targetText = Array.isArray(targetHeader) ? targetHeader[0] : targetHeader
  if (!targetText) return json(res, 400, { error: { message: 'Missing x-target-url header' } })

  let target
  try {
    target = new URL(targetText)
  } catch {
    return json(res, 400, { error: { message: 'Invalid x-target-url header' } })
  }
  if (!['http:', 'https:'].includes(target.protocol) || !isAllowedHost(target.hostname)) {
    return json(res, 403, { error: { message: 'Target host is not allowed by the proxy' } })
  }

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    return json(res, 413, { error: { message: error instanceof Error ? error.message : 'Request body too large' } })
  }

  const headers = {}
  for (const name of ['content-type', 'authorization', 'x-goog-api-key', 'x-dashscope-async', 'accept']) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  if (body.length) headers['content-length'] = String(body.length)

  const transport = target.protocol === 'https:' ? https : http
  const upstream = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    path: `${target.pathname}${target.search}`,
    method: req.method || 'POST',
    headers,
  }, (response) => {
    const responseHeaders = {
      'Content-Type': response.headers['content-type'] || 'application/json; charset=utf-8',
    }
    res.writeHead(response.statusCode || 502, responseHeaders)
    response.pipe(res)
  })
  upstream.on('error', (error) => {
    if (!res.headersSent) json(res, 502, { error: { message: error.message || 'Upstream request failed' } })
    else res.destroy(error)
  })
  if (body.length) upstream.write(body)
  upstream.end()
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET,POST,OPTIONS' })
    res.end()
    return
  }
  if ((req.url || '').split('?')[0] !== '/api/proxy' && (req.url || '').split('?')[0] !== '/proxy') {
    json(res, 404, { error: { message: 'Not found' } })
    return
  }
  void handleProxy(req, res).catch((error) => {
    if (!res.headersSent) json(res, 500, { error: { message: error?.message || 'Proxy request failed' } })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`AI proxy listening on 127.0.0.1:${port}`)
})
