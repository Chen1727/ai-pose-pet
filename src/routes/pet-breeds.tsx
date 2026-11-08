import { createFileRoute } from '@tanstack/react-router'
import { PetGalleryPage } from './pets'
import { petsQuery } from '@/api/pets'

export const Route = createFileRoute('/pet-breeds')({
  staticData: { title: '猫狗种类库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(petsQuery),
  component: () => <PetGalleryPage mode="breeds" title="猫狗种类库" description="按猫咪与狗狗种类整理的外形、毛色和体态参考" />,
})
