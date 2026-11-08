import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ShirtIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { costumesQuery } from '@/api/gallery'

export const Route = createFileRoute('/costumes')({
  staticData: { title: '服装穿搭库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(costumesQuery),
  component: CostumesPage,
})

function CostumesPage() {
  const { data } = useSuspenseQuery(costumesQuery)
  return <div className="space-y-6">
    <PageHeader title="服装穿搭库" description={`当前收录 ${data.length} 张参考图`} />
    <EmptyState icon={ShirtIcon} title="图库正在整理" description="后续将在这里添加你的宠物穿搭与配饰参考图。" />
  </div>
}
