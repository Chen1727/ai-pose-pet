export type PetCategory = 'cat' | 'dog' | 'interaction' | 'pet_costume'
export type PetGalleryKind = 'breed' | 'pose' | 'interaction' | 'costume'

export interface PetView {
  id: string
  label: string
  thumbnail: string
  original: string
}

export interface PetImage {
  id: string
  title: string
  category: PetCategory
  kind?: PetGalleryKind
  species?: 'cat' | 'dog'
  label: string
  type: string
  subtitle?: string
  tags: string[]
  thumbnail: string
  original: string
  views?: PetView[]
  createdAt?: number
  source?: 'upload'
}
