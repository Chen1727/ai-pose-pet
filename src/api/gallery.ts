import { queryOptions } from '@tanstack/react-query'
import type { CostumeItem, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'

const PET_API_BASE = (import.meta.env.VITE_PET_API_URL || '/pet-api').replace(/\/$/, '')

type GalleryViewResponse = {
  id: string
  image_id: number
  label: string
  thumbnail: string
  original: string
}

type GalleryItemResponse = {
  id: string
  library_id: string
  kind: 'breed' | 'pose' | 'interaction' | 'costume' | 'portrait'
  label: string
  type: string
  title: string
  category: string
  species: string
  season: string
  hair_length: string
  subtitle: string
  tags: string[]
  thumbnail: string
  original: string
  views: GalleryViewResponse[]
  created_at: string
}

type GalleryListResponse = { items: GalleryItemResponse[]; total: number }
export type GalleryLibraryId = 'pet-poses' | 'pet-breeds' | 'pet-costumes' | 'pet-interactions' | 'costumes' | 'portraits'
export type GalleryFacets = {
  total: number
  categories: Record<string, number>
  species: Record<string, number>
  seasons: Record<string, number>
  hair_lengths: Record<string, number>
}

async function fetchGallery(libraryId: string): Promise<GalleryItemResponse[]> {
  const items: GalleryItemResponse[] = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${PET_API_BASE}/api/gallery?library_id=${encodeURIComponent(libraryId)}&page=${page}&page_size=100`)
    if (!response.ok) throw new Error(`加载图库失败（${libraryId}）：HTTP ${response.status}`)
    const result = await response.json() as GalleryListResponse
    items.push(...result.items)
    if (items.length >= result.total || result.items.length === 0) break
  }
  return items
}

function assetUrl(view: GalleryViewResponse): string {
  // Gallery browsing uses the OSS URL; canvas composition applies its own API proxy.
  return view.thumbnail || view.original
}

export function galleryFacetsQuery(libraryId: GalleryLibraryId) {
  return queryOptions({
    queryKey: ['gallery', 'facets', libraryId],
    staleTime: 60_000,
    queryFn: async (): Promise<GalleryFacets> => {
      const response = await fetch(`${PET_API_BASE}/api/gallery/facets?library_id=${encodeURIComponent(libraryId)}`)
      if (!response.ok) throw new Error(`加载图库分类失败（${libraryId}）：HTTP ${response.status}`)
      return response.json() as Promise<GalleryFacets>
    },
  })
}

export const ANGLES = ['正面', '俯视', '仰视', '侧面', '斜侧'] as const

export const PREFERRED_POSE_LINE_ORDER = [] as const

export function buildPoseGroups(items: PoseItem[]): { items: PoseItem[]; groups: PoseGroup[]; lines: string[] } {
  const rawLines = [...new Set(items.map((x) => x.体系))]
  const lines = rawLines.sort((a, b) => {
    const ia = PREFERRED_POSE_LINE_ORDER.indexOf(a as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    const ib = PREFERRED_POSE_LINE_ORDER.indexOf(b as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  const groupMap = new Map<string, PoseGroup>()
  const groups: PoseGroup[] = []

  for (const item of items) {
    const key = `${item.体系}|${item.姿势编号 || item.id}`
    let group = groupMap.get(key)
    if (!group) {
      group = {
        key,
        system: item.体系,
        number: item.姿势编号,
        name: item.姿势名称,
        category: item.分类,
        items: [],
        angles: {},
        order: [],
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
    if (item.角度 && !group.angles[item.角度]) {
      group.angles[item.角度] = item
    }
  }

  groups.sort((a, b) => lines.indexOf(a.system) - lines.indexOf(b.system) || String(a.number).localeCompare(String(b.number)))
  for (const group of groups) {
    group.order = ANGLES.map((a) => group.angles[a]).filter(Boolean)
    for (const item of group.items) {
      if (!group.order.includes(item)) group.order.push(item)
    }
  }

  return { items, groups, lines }
}

export const posesQuery = queryOptions({
  queryKey: ['gallery', 'poses'],
  staleTime: 60_000,
  queryFn: async () => {
    const groups = await fetchGallery('pet-poses')
    const data: PoseItem[] = groups.flatMap((group) => group.views.map((view) => ({
      source: 'upload' as const,
      id: `${group.id}:${view.id}`,
      体系: group.species === 'cat' ? '猫猫姿势' : '狗狗姿势',
      姿势编号: group.id,
      分类: group.category,
      姿势名称: group.title,
      角度: view.label,
      缩略图: assetUrl(view),
      原图: assetUrl(view),
      检索: `${group.title} ${group.tags.join(' ')}`,
    })))
    return buildPoseGroups(data)
  },
})

export const costumesQuery = queryOptions({
  queryKey: ['gallery', 'costumes'],
  staleTime: 60_000,
  queryFn: async () => {
    const groups = await fetchGallery('costumes')
    return groups.map((item): CostumeItem => ({
      source: 'upload',
      id: item.id,
      分类: item.category,
      服装名称: item.title,
      标签: item.tags,
      关键词: `${item.title} ${item.tags.join(' ')}`,
      缩略图: item.views[0] ? assetUrl(item.views[0]) : item.thumbnail,
      预览图: item.views[0] ? assetUrl(item.views[0]) : item.original,
      原图: item.views[0] ? assetUrl(item.views[0]) : item.original,
      检索: `${item.title} ${item.category} ${item.tags.join(' ')}`,
      views: item.views.map((view) => ({
        id: view.id,
        label: view.label,
        缩略图: assetUrl(view),
        预览图: assetUrl(view),
        原图: assetUrl(view),
      })),
    }))
  },
})

export const portraitsQuery = queryOptions({
  queryKey: ['gallery', 'portraits'],
  staleTime: 60_000,
  queryFn: async () => {
    const groups = await fetchGallery('portraits')
    return groups.map((item): PortraitItem => ({
      source: 'upload',
      id: item.id,
      分区: item.category,
      发长: item.hair_length,
      发型名称: item.subtitle,
      标题: item.title,
      宽: 0,
      高: 0,
      字节数: 0,
      精选: false,
      热门: false,
      缩略图: item.views[0] ? assetUrl(item.views[0]) : item.thumbnail,
      原图: item.views[0] ? assetUrl(item.views[0]) : item.original,
      检索: `${item.title} ${item.category} ${item.hair_length} ${item.subtitle}`,
    }))
  },
})
