import { queryOptions } from '@tanstack/react-query'
import type { PetImage } from '@/types/pet'

export const petsQuery = queryOptions({
  queryKey: ['gallery', 'pets'],
  staleTime: 30_000,
  queryFn: async () => {
    const [seedResponse, uploadedResponse] = await Promise.all([
      fetch('/data/pets.json'),
      fetch('/api/pets').catch(() => null),
    ])
    if (!seedResponse.ok) throw new Error(`加载宠物图库失败: HTTP ${seedResponse.status}`)
    const seed = (await seedResponse.json()) as PetImage[]
    const uploaded = uploadedResponse?.ok ? ((await uploadedResponse.json()) as PetImage[]) : []
    return [...uploaded, ...seed]
  },
})
