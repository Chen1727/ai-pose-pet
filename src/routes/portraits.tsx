import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { UserRoundIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { portraitsQuery } from '@/api/gallery'

export const Route = createFileRoute('/portraits')({
  staticData: { title: '人像颜值库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(portraitsQuery),
  component: PortraitsPage,
})

function PortraitsPage() {
  const { data } = useSuspenseQuery(portraitsQuery)
  return <div className="space-y-6">
    <PageHeader title="人像颜值库" description={`当前收录 ${data.length} 张参考图`} />
    <EmptyState icon={UserRoundIcon} title="图库正在整理" description="后续将在这里添加你的人宠互动人物参考图。" />
  </div>
}
