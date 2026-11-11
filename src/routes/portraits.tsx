import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SearchIcon, UserRoundIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ImageViewer } from '@/components/common/ImageViewer'
import { PageHeader } from '@/components/common/PageHeader'
import { galleryFacetsQuery, portraitsQuery } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStudio } from '@/store/studioStore'
import type { PortraitItem } from '@/types/gallery'

export const Route = createFileRoute('/portraits')({
  staticData: { title: '人像颜值库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(portraitsQuery),
  component: PortraitsPage,
})

const genderFilters = ['全部', '男生', '女生'] as const
const hairFilters = ['全部', '短发', '中发', '中长发', '长发'] as const

function PortraitsPage() {
  const { data } = useSuspenseQuery(portraitsQuery)
  const { data: facets } = useQuery(galleryFacetsQuery('portraits'))
  const { recipe, setPortrait } = useStudio()
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState<(typeof genderFilters)[number]>('全部')
  const [hair, setHair] = useState<(typeof hairFilters)[number]>('全部')
  const [selected, setSelected] = useState<PortraitItem | null>(null)
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('zh-CN')
    return data.filter((item) => {
      if (gender !== '全部' && !item.分区.includes(gender)) return false
      if (hair !== '全部' && item.发长 !== hair) return false
      return !value || `${item.标题} ${item.分区} ${item.发长} ${item.发型名称}`.toLocaleLowerCase('zh-CN').includes(value)
    })
  }, [data, gender, hair, query])
  const countFor = (filter: string, group: 'gender' | 'hair') => group === 'hair'
    ? filter === '全部' ? (facets?.total ?? data.length) : (facets?.hair_lengths[filter] ?? data.filter((item) => item.发长 === filter).length)
    : data.filter((item) => filter === '全部' || item.分区.includes(filter)).length

  return <div className="space-y-6">
    <PageHeader title="人像颜值库" description={`当前收录 ${data.length} 张参考图`} />
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><span className="w-12 text-sm font-medium">性别</span>{genderFilters.map((item) => <button key={item} type="button" onClick={() => setGender(item)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${gender === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item} <span className="ml-1 text-xs opacity-70">{countFor(item, 'gender')}</span></button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><span className="w-12 text-sm font-medium">发型</span>{hairFilters.map((item) => <button key={item} type="button" onClick={() => setHair(item)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${hair === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item} <span className="ml-1 text-xs opacity-70">{countFor(item, 'hair')}</span></button>)}</div>
      <div className="flex items-center gap-2">
        <label className="relative w-full max-w-sm"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索分区、发长或发型…" className="bg-background pl-9" /></label>
      </div>
      <span className="text-xs text-muted-foreground">显示 {filtered.length} 张</span>
    </div>
    {filtered.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filtered.map((item) => {
        const selected = recipe.portrait?.id === item.id
        return <article key={item.id} className="pet-gallery-card group flex min-w-0 flex-col overflow-hidden">
          <button type="button" className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted text-left" onClick={() => setSelected(item)}>
            <img src={item.缩略图} alt={item.标题} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
            <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1"><span className="rounded-full bg-background/90 px-2 py-1 text-[11px]">{item.分区}</span><span className="rounded-full bg-background/90 px-2 py-1 text-[11px]">{item.发长}</span></span>
          </button>
          <div className="flex min-w-0 items-center gap-2 px-1 pt-2.5 pb-1"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{item.标题}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{item.发型名称}</p></div><Button variant={selected ? 'secondary' : 'ghost'} size="icon-sm" aria-label={selected ? '移除人像' : '选择人像'} onClick={() => setPortrait(selected ? null : item)}>{selected ? <XIcon className="size-4 text-primary" /> : <UserRoundIcon className="size-4" />}</Button></div>
        </article>
      })}
    </div> : <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">没有找到匹配的人像参考</div>}
    <ImageViewer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} imageUrl={selected?.原图 || ''} title={selected?.标题} />
  </div>
}
