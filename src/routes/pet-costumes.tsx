import { createFileRoute } from '@tanstack/react-router'
import { PetGalleryPage } from './pets'

export const Route = createFileRoute('/pet-costumes')({
  staticData: { title: '宠物服装库' },
  component: () => <PetGalleryPage mode="costumes" initialCategory="pet_costume" title="宠物服装库" description="为猫狗造型收集的服装与配饰参考" />,
})
