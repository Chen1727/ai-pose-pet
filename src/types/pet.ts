export type PetCategory = 'cat' | 'dog' | 'interaction' | 'pet_costume'

export interface PetImage {
  id: string
  title: string
  category: PetCategory
  label: string
  type: string
  tags: string[]
  thumbnail: string
  original: string
  createdAt?: number
  source?: 'upload'
}
