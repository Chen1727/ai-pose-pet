import { infiniteQueryOptions } from '@tanstack/react-query'
import type { PetImage } from '@/types/pet'

const PET_API_BASE = (import.meta.env.VITE_PET_API_URL || '/pet-api').replace(/\/$/, '')
export const PET_PAGE_SIZE = 15
export const PET_LIBRARY_IDS = ['pet-breeds', 'pet-poses', 'pet-costumes', 'pet-interactions'] as const
export type PetLibraryId = (typeof PET_LIBRARY_IDS)[number]

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
  kind: 'breed' | 'pose' | 'interaction' | 'costume'
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

type GalleryListResponse = {
  items: GalleryItemResponse[]
  page: number
  page_size: number
  total: number
}

export type PetGalleryPage = {
  items: PetImage[]
  page: number
  pageSize: number
  total: number
}

async function fetchGalleryPage(libraryId: PetLibraryId, page: number): Promise<PetGalleryPage> {
  const response = await fetch(`${PET_API_BASE}/api/gallery?library_id=${encodeURIComponent(libraryId)}&page=${page}&page_size=${PET_PAGE_SIZE}`)
  if (!response.ok) throw new Error(`加载图库失败（${libraryId}）：HTTP ${response.status}`)
  const result = await response.json() as GalleryListResponse
  return {
    items: result.items.map(mapGalleryItem),
    page: result.page || page,
    pageSize: result.page_size || PET_PAGE_SIZE,
    total: result.total,
  }
}

function mapGalleryItem(item: GalleryItemResponse): PetImage {
  const category = item.pet_category === 'interaction' || item.library_id === 'pet-interactions'
    ? 'interaction'
    : item.pet_category === 'pet_costume' || item.library_id === 'pet-costumes'
      ? 'pet_costume'
      : item.species === 'cat' || item.species === 'dog' ? item.species : 'dog'
  const views = item.views.map((view) => ({
    id: view.id,
    label: view.label,
    // The API may return an internal OSS host. Use the same-origin asset
    // endpoint so browsers can load the image in production as well.
    thumbnail: `${PET_API_BASE}/api/gallery/assets/${view.image_id}?variant=thumbnail`,
    original: `${PET_API_BASE}/api/gallery/assets/${view.image_id}?variant=original`,
  }))
  return {
    id: item.id,
    title: item.title,
    category,
    kind: item.kind,
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

export const petGalleryQuery = (libraryId: PetLibraryId) => infiniteQueryOptions({
  queryKey: ['gallery', 'pets', libraryId],
  initialPageParam: 1,
  staleTime: 60_000,
  queryFn: ({ pageParam }) => fetchGalleryPage(libraryId, pageParam),
  getNextPageParam: (lastPage) => lastPage.page < Math.ceil(lastPage.total / lastPage.pageSize) ? lastPage.page + 1 : undefined,
})
