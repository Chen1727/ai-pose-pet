import { createFileRoute } from '@tanstack/react-router'
import { PetGalleryPage } from './pets'
import { petsQuery } from '@/api/pets'

export const Route = createFileRoute('/pet-poses')({
  staticData: { title: '宠物姿势库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(petsQuery),
  component: () => <PetGalleryPage mode="poses" initialCategory="all" title="宠物姿势库" description="猫咪与狗狗的动作、姿态和镜头参考" />,
})
