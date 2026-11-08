import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dataDir = path.resolve(process.env.DATA_DIR || './data')
const uploadDir = path.join(dataDir, 'pet-uploads')
const catalogPath = path.join(dataDir, 'pet-uploads.json')
const password = process.env.ADMIN_PASSWORD
const secret = process.env.SESSION_SECRET
const port = Number(process.env.API_PORT || 3000)
if (!password || !secret || secret.length < 32) throw new Error('请配置 ADMIN_PASSWORD 和至少 32 位的 SESSION_SECRET。')
await mkdir(uploadDir, { recursive: true })

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback')
app.use(express.json({ limit: '8kb' }))

function constantTimeEqual(left, right) {
  const a = createHash('sha256').update(left).digest()
  const b = createHash('sha256').update(right).digest()
  return timingSafeEqual(a, b)
}
function sign(payload) { return createHmac('sha256', secret).update(payload).digest('base64url') }
function isAdmin(req) {
  const token = /(?:^|; )paw_admin=([^;]+)/.exec(req.headers.cookie || '')?.[1]
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !constantTimeEqual(sign(payload), signature)) return false
  return Number(Buffer.from(payload, 'base64url').toString()) > Date.now()
}
function adminOnly(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: '请先登录管理员账号。' })
  next()
}
async function readUploads() {
  try {
    const parsed = JSON.parse(await readFile(catalogPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
let pendingWrite = Promise.resolve()
function saveUpload(item) {
  const write = pendingWrite.then(async () => {
    const records = await readUploads()
    records.unshift(item)
    const temp = `${catalogPath}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(records, null, 2), 'utf8')
    await rename(temp, catalogPath)
  })
  pendingWrite = write.catch(() => {})
  return write
}

const loginState = new Map()
app.get('/api/auth', (req, res) => res.json({ authenticated: isAdmin(req) }))
app.post('/api/login', (req, res) => {
  const state = loginState.get(req.ip) || { failures: 0, lockedUntil: 0 }
  if (state.lockedUntil > Date.now()) return res.status(429).json({ error: '尝试次数过多，请稍后再试。' })
  if (!constantTimeEqual(String(req.body?.password || ''), password)) {
    state.failures += 1
    if (state.failures >= 5) { state.failures = 0; state.lockedUntil = Date.now() + 15 * 60_000 }
    loginState.set(req.ip, state)
    return res.status(401).json({ error: '密码不正确。' })
  }
  loginState.delete(req.ip)
  const payload = Buffer.from(String(Date.now() + 7 * 24 * 60 * 60_000)).toString('base64url')
  res.setHeader('Set-Cookie', `paw_admin=${payload}.${sign(payload)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`)
  res.json({ authenticated: true })
})
app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'paw_admin=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict')
  res.json({ authenticated: false })
})
app.get('/api/pets', async (_req, res, next) => {
  try { res.json(await readUploads()) } catch (error) { next(error) }
})

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
})
app.post('/api/pets', adminOnly, imageUpload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: '请选择 JPG、PNG 或 WebP 图片（最大 8MB）。' })
  const title = String(req.body.title || '').trim().slice(0, 80)
  const category = String(req.body.category || '')
  if (!title || !['cat', 'dog', 'interaction', 'pet_costume'].includes(category)) return res.status(400).json({ error: '请填写名称并选择图库分类。' })
  const id = randomUUID()
  const filename = `${id}.webp`
  const destination = path.join(uploadDir, filename)
  try {
    await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(destination)
    const label = { cat: '猫咪', dog: '狗狗', interaction: '人宠互动', pet_costume: '宠物服装' }[category]
    const record = {
      id, title, category, label,
      type: String(req.body.type || '姿态参考').trim().slice(0, 40),
      tags: String(req.body.tags || '').trim().split(/\s+/).filter(Boolean).slice(0, 12),
      thumbnail: `/uploads/${filename}`, original: `/uploads/${filename}`,
      createdAt: Date.now(), source: 'upload',
    }
    try { await saveUpload(record) } catch (error) { await unlink(destination); throw error }
    res.status(201).json(record)
  } catch (error) { next(error) }
})
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true }))
app.use((error, _req, res, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError) return res.status(400).json({ error: '图片过大或上传格式不正确。' })
  if (error.message?.includes('Input image') || error.message?.includes('unsupported image')) return res.status(400).json({ error: '图片无法处理，请换一张图片试试。' })
  res.status(500).json({ error: '服务器处理失败，请稍后重试。' })
})
app.listen(port, '127.0.0.1', () => console.log(`Pet gallery API listening on 127.0.0.1:${port}`))
