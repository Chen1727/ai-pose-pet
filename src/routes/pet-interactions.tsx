import { createFileRoute } from '@tanstack/react-router'
import { PetGalleryPage } from './pets'
import { petsQuery } from '@/api/pets'

export const Route = createFileRoute('/pet-interactions')({
  staticData: { title: '人宠互动图库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(petsQuery),
  component: () => <PetGalleryPage initialCategory="interaction" title="人宠互动图库" description="拥抱、陪伴、散步和合影的人宠互动构图参考" />,
})
