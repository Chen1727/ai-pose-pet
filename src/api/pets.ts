import { queryOptions } from '@tanstack/react-query'
import type { PetImage } from '@/types/pet'

const PET_API_BASE = (import.meta.env.VITE_PET_API_URL || '/pet-api').replace(/\/$/, '')
const PET_LIBRARY_IDS = ['pet-breeds', 'pet-poses', 'pet-costumes', 'pet-interactions'] as const

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
  total: number
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

function mapGalleryItem(item: GalleryItemResponse): PetImage {
  const category = item.library_id === 'pet-interactions'
    ? 'interaction'
    : item.library_id === 'pet-costumes'
      ? 'pet_costume'
      : item.species === 'cat' || item.species === 'dog' ? item.species : 'dog'
  const views = item.views.map((view) => ({
    id: view.id,
    label: view.label,
    // The API already returns signed OSS URLs. Keep them for gallery browsing
    // instead of routing every image through the application server.
    thumbnail: view.thumbnail,
    original: view.original,
  }))
  return {
    id: item.id,
    title: item.title,
    category,
    kind: item.kind,
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

export const petsQuery = queryOptions({
  queryKey: ['gallery', 'pets'],
  staleTime: 60_000,
  queryFn: async () => {
    const results = await Promise.all(PET_LIBRARY_IDS.map(fetchGallery))
    return results.flat().map(mapGalleryItem)
  },
})
