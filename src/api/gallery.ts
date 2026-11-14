import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { CostumeItem, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'
import type { PetImage } from '@/types/pet'

const PET_API_BASE = (import.meta.env.VITE_PET_API_URL || '/pet-api').replace(/\/$/, '')
export const GALLERY_PAGE_SIZE = 15

type GalleryViewResponse = {
  id: string
  image_id: number
  label: string
  thumbnail: string
  original: string
}

export type GalleryItemResponse = {
  id: string
  library_id: string
  kind: 'breed' | 'pose' | 'interaction' | 'costume' | 'portrait'
  label: string
  type: string
  pet_category: string
  title: string
  category_id: number | null
  category_ids: number[]
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

type GalleryListResponse = { items: GalleryItemResponse[]; page: number; page_size: number; total: number }
export type GalleryPage<T> = { items: T[]; page: number; pageSize: number; total: number }
export type GalleryLibraryId = 'pet-poses' | 'pet-breeds' | 'pet-costumes' | 'pet-interactions' | 'costumes' | 'portraits'
export type GalleryFacetOption = {
  id: number
  parent_id: number | null
  category_type: string
  code: string
  name: string
  value: string
  image_count: number
}
export type GalleryFacets = {
  total: number
  categories: Record<string, number>
  species: Record<string, number>
  seasons: Record<string, number>
  hair_lengths: Record<string, number>
  category_options?: GalleryFacetOption[]
}

export type GalleryStats = {
  total: number
  image_total: number
  libraries: Array<{
    id: GalleryLibraryId
    name: string
    kind: GalleryItemResponse['kind']
    group_count: number
    image_count: number
  }>
}

export type GalleryRandomRecipe = {
  portrait: PortraitItem | null
  costume: CostumeItem | null
  pose: PoseItem | null
  pet: PetImage | null
  petCostume: PetImage | null
  interaction: PetImage | null
}

export type GalleryRandomItemOptions = {
  excludeId?: string
  species?: 'cat' | 'dog'
  category?: string
  gender?: 'male' | 'female'
}

export type GalleryRandomRecipeOptions = {
  excludeIds?: Record<string, string>
  gender?: 'male' | 'female'
  petSpecies?: 'cat' | 'dog'
}

async function fetchGalleryPage(libraryId: GalleryLibraryId, page: number): Promise<GalleryPage<GalleryItemResponse>> {
  const response = await fetch(`${PET_API_BASE}/api/gallery?library_id=${encodeURIComponent(libraryId)}&page=${page}&page_size=${GALLERY_PAGE_SIZE}`)
  if (!response.ok) throw new Error(`加载图库失败（${libraryId}）：HTTP ${response.status}`)
  const result = await response.json() as GalleryListResponse
  return { items: result.items, page: result.page || page, pageSize: result.page_size || GALLERY_PAGE_SIZE, total: result.total }
}

export async function fetchGalleryItemsByIds(ids: string[], libraryId?: GalleryLibraryId): Promise<GalleryItemResponse[]> {
  const params = new URLSearchParams()
  for (const id of ids) params.append('ids', id)
  if (libraryId) params.set('library_id', libraryId)
  const response = await fetch(`${PET_API_BASE}/api/gallery/items?${params.toString()}`)
  if (!response.ok) throw new Error(`加载已保存素材失败：HTTP ${response.status}`)
  const result = await response.json() as GalleryListResponse
  return result.items
}

export async function requestRandomItem(libraryId: GalleryLibraryId, options: GalleryRandomItemOptions = {}): Promise<GalleryItemResponse> {
  const params = new URLSearchParams({ library_id: libraryId })
  if (options.excludeId) params.set('exclude_id', options.excludeId)
  if (options.species) params.set('species', options.species)
  if (options.category) params.set('category', options.category)
  if (options.gender) params.set('gender', options.gender)
  const response = await fetch(`${PET_API_BASE}/api/gallery/random?${params.toString()}`)
  if (!response.ok) throw new Error(`加载随机素材失败（${libraryId}）：HTTP ${response.status}`)
  return response.json() as Promise<GalleryItemResponse>
}

function assetUrl(view: GalleryViewResponse, variant: 'thumbnail' | 'original' = 'original'): string {
  return view.image_id
    ? `${PET_API_BASE}/api/gallery/assets/${view.image_id}?variant=${variant}`
    : view.thumbnail || view.original
}

function originalUrl(view: GalleryViewResponse): string {
  return assetUrl(view, 'original')
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

export const galleryStatsQuery = queryOptions({
  queryKey: ['gallery', 'stats'],
  staleTime: 60_000,
  queryFn: async (): Promise<GalleryStats> => {
    const response = await fetch(`${PET_API_BASE}/api/gallery/stats`)
    if (!response.ok) throw new Error(`加载图库统计失败：HTTP ${response.status}`)
    return response.json() as Promise<GalleryStats>
  },
})

function recommendationAssetUrl(view: GalleryViewResponse, variant: 'thumbnail' | 'original') {
  return `${PET_API_BASE}/api/gallery/assets/${view.image_id}?variant=${variant}`
}

export function mapGalleryPetItem(item: GalleryItemResponse): PetImage {
  const category = item.pet_category === 'interaction'
    ? 'interaction'
    : item.pet_category === 'pet_costume'
      ? 'pet_costume'
      : item.species === 'cat' || item.species === 'dog' ? item.species : 'dog'
  const views = item.views.map((view) => ({
    id: view.id,
    label: view.label,
    thumbnail: recommendationAssetUrl(view, 'thumbnail'),
    original: recommendationAssetUrl(view, 'original'),
  }))
  return {
    id: item.id,
    title: item.title,
    category,
    kind: item.kind === 'portrait' ? undefined : item.kind,
    species: item.species === 'cat' || item.species === 'dog' ? item.species : undefined,
    label: item.label,
    type: item.type,
    subtitle: item.subtitle,
    tags: item.tags,
    thumbnail: views[0]?.thumbnail || item.thumbnail,
    original: views[0]?.original || item.original,
    views,
    createdAt: Date.parse(item.created_at) || 0,
    source: 'upload',
  }
}

function mapRecommendation(item: GalleryItemResponse): PetImage {
  return mapGalleryPetItem(item)
}

export const galleryRecommendationsQuery = queryOptions({
  queryKey: ['gallery', 'recommendations', 4],
  staleTime: 60_000,
  queryFn: async () => {
    const response = await fetch(`${PET_API_BASE}/api/gallery/recommendations?limit=4`)
    if (!response.ok) throw new Error(`加载图库推荐失败：HTTP ${response.status}`)
    const result = await response.json() as { items: GalleryItemResponse[] }
    return result.items.map(mapRecommendation)
  },
})

export const ANGLES = ['正面', '俯视', '仰视', '侧面', '斜侧'] as const

export const PREFERRED_POSE_LINE_ORDER = [] as const

export function mapCostumeItem(item: GalleryItemResponse): CostumeItem {
  return {
    source: 'upload',
    id: item.id,
    分类: item.category,
    服装名称: item.title,
    标签: item.tags,
    关键词: `${item.title} ${item.tags.join(' ')}`,
    缩略图: item.views[0] ? assetUrl(item.views[0], 'thumbnail') : item.thumbnail,
    预览图: item.views[0] ? originalUrl(item.views[0]) : item.original,
    原图: item.views[0] ? originalUrl(item.views[0]) : item.original,
    检索: `${item.title} ${item.category} ${item.tags.join(' ')}`,
    views: item.views.map((view) => ({
      id: view.id,
      label: view.label,
      缩略图: assetUrl(view, 'thumbnail'),
      预览图: originalUrl(view),
      原图: originalUrl(view),
    })),
  }
}

export function mapPortraitItem(item: GalleryItemResponse): PortraitItem {
  return {
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
    缩略图: item.views[0] ? assetUrl(item.views[0], 'thumbnail') : item.thumbnail,
    原图: item.views[0] ? originalUrl(item.views[0]) : item.original,
    检索: `${item.title} ${item.category} ${item.hair_length} ${item.subtitle}`,
  }
}

export function mapPoseItem(item: GalleryItemResponse): PoseItem {
  const view = item.views[0]
  return {
    source: 'upload',
    id: `${item.id}:${view?.id || 'default'}`,
    体系: item.pet_category === 'interaction' ? '人宠互动' : item.species === 'cat' ? '猫猫姿势' : '狗狗姿势',
    姿势编号: item.id,
    分类: item.category || item.type,
    姿势名称: item.title,
    角度: view?.label || item.label,
    缩略图: view ? assetUrl(view, 'thumbnail') : item.thumbnail,
    原图: view ? originalUrl(view) : item.original,
    检索: `${item.title} ${item.tags.join(' ')}`,
  }
}

export async function requestRandomRecipe(options: GalleryRandomRecipeOptions = {}): Promise<GalleryRandomRecipe> {
  const response = await fetch(`${PET_API_BASE}/api/gallery/random-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exclude_ids: options.excludeIds || {},
      gender: options.gender,
      pet_species: options.petSpecies,
    }),
  })
  if (!response.ok) throw new Error(`加载随机合成方案失败：HTTP ${response.status}`)
  const result = await response.json() as {
    portrait: GalleryItemResponse | null
    costume: GalleryItemResponse | null
    pose: GalleryItemResponse | null
    pet: GalleryItemResponse | null
    pet_costume: GalleryItemResponse | null
    interaction: GalleryItemResponse | null
  }
  return {
    portrait: result.portrait ? mapPortraitItem(result.portrait) : null,
    costume: result.costume ? mapCostumeItem(result.costume) : null,
    pose: result.pose ? mapPoseItem(result.pose) : null,
    pet: result.pet ? mapGalleryPetItem(result.pet) : null,
    petCostume: result.pet_costume ? mapGalleryPetItem(result.pet_costume) : null,
    interaction: result.interaction ? mapGalleryPetItem(result.interaction) : null,
  }
}

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

export const costumesInfiniteQuery = infiniteQueryOptions({
  queryKey: ['gallery', 'costumes', 'pages'],
  initialPageParam: 1,
  staleTime: 60_000,
  queryFn: async ({ pageParam }) => {
    const page = await fetchGalleryPage('costumes', pageParam)
    return { ...page, items: page.items.map(mapCostumeItem) }
  },
  getNextPageParam: (lastPage) => lastPage.page < Math.ceil(lastPage.total / lastPage.pageSize) ? lastPage.page + 1 : undefined,
})

export const portraitsInfiniteQuery = infiniteQueryOptions({
  queryKey: ['gallery', 'portraits', 'pages'],
  initialPageParam: 1,
  staleTime: 60_000,
  queryFn: async ({ pageParam }) => {
    const page = await fetchGalleryPage('portraits', pageParam)
    return { ...page, items: page.items.map(mapPortraitItem) }
  },
  getNextPageParam: (lastPage) => lastPage.page < Math.ceil(lastPage.total / lastPage.pageSize) ? lastPage.page + 1 : undefined,
})
