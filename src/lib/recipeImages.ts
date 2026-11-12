import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'

const PET_API_BASE = (import.meta.env.VITE_PET_API_URL || '/pet-api').replace(/\/$/, '')

export function referenceImageUrl(src: string): string {
  return /^(data:|https?:\/\/|\/)/i.test(src) ? src : `/${src}`
}

/** Use the API only when a browser canvas needs a same-origin image response. */
export function compositionImageUrl(src: string): string {
  const normalized = referenceImageUrl(src)
  if (/^(data:|blob:)/i.test(normalized)) return normalized

  try {
    const url = new URL(normalized, typeof window === 'undefined' ? undefined : window.location.origin)
    // OSS signs paths such as `images%2Fportraits%2F...`; decode the path
    // before mapping it to the same-origin API image route for canvas use.
    const pathname = decodeURIComponent(url.pathname)
    const marker = '/images/'
    const markerIndex = pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return `${PET_API_BASE}${pathname.slice(markerIndex)}${url.search}`
    }
  } catch {
    // Keep the original URL when it cannot be parsed as a browser URL.
  }
  return normalized
}

export function poseThumbPath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.缩略图
  if (pose.source === 'upload' || !useDepth || /^(data:|https?:\/\/)/i.test(raw)) return raw
  const clean = raw.replace(/^\/+/, '')
  if (clean.startsWith('thumbs/depth/')) return raw
  if (clean.startsWith('thumbs/')) {
    return `thumbs/depth/${clean.slice('thumbs/'.length).replace(/\.(jpe?g|png)$/i, '.webp')}`
  }
  return raw
}

export function poseImagePath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.原图 || pose.缩略图
  if (pose.source === 'upload' || !useDepth || /^(data:|https?:\/\/)/i.test(raw)) return raw
  const clean = raw.replace(/^\/+/, '')
  if (clean.startsWith('img/depth/')) return raw
  if (clean.startsWith('img/')) {
    return `img/depth/${clean.slice('img/'.length).replace(/\.(png|jpe?g)$/i, '.webp')}`
  }
  return raw
}

export function uploadedReferences(name: string, url: string, width: number, height: number, bytes: number) {
  const base = { id: crypto.randomUUID(), source: 'upload' as const, 原图: url, 缩略图: url, 检索: name }
  const portrait: PortraitItem = {
    ...base, 分区: '上传', 发长: '', 发型名称: name, 标题: name,
    宽: width, 高: height, 字节数: bytes, 精选: false, 热门: false,
  }
  const costume: CostumeItem = {
    ...base, 分类: '上传', 服装名称: name, 标签: [], 关键词: '', 预览图: url,
  }
  const pose: PoseItem = {
    ...base, 体系: '上传', 姿势编号: '', 分类: '上传', 姿势名称: name, 角度: '',
  }
  return { portrait, costume, pose }
}


export function recipeBackup(recipe: RecipeState): RecipeState {
  return {
    portrait: recipe.portrait?.source === 'upload' ? null : recipe.portrait,
    costume: recipe.costume?.source === 'upload' ? null : recipe.costume,
    pose: recipe.pose?.source === 'upload' ? null : recipe.pose,
    extraImages: [],
    workflowImages: {},
  }
}
