import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ImagePlusIcon, SearchIcon, ShirtIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ImageViewer } from '@/components/common/ImageViewer'
import { PageHeader } from '@/components/common/PageHeader'
import { costumesQuery, galleryFacetsQuery } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStudio } from '@/store/studioStore'
import type { CostumeItem } from '@/types/gallery'

const seasons = ['全部', '春季', '夏季', '秋季', '冬季'] as const
const genders = ['全部', '女生', '男生'] as const

export const Route = createFileRoute('/costumes')({
  staticData: { title: '服装穿搭库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(costumesQuery),
  component: CostumesPage,
})

function CostumesPage() {
  const { data } = useSuspenseQuery(costumesQuery)
  const { data: facets } = useQuery(galleryFacetsQuery('costumes'))
  const { setCostume, recipe } = useStudio()
  const [season, setSeason] = useState<(typeof seasons)[number]>('全部')
  const [gender, setGender] = useState<(typeof genders)[number]>('全部')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CostumeItem | null>(null)
  const [selectedUrl, setSelectedUrl] = useState('')
  const filtered = useMemo(() => data.filter((item) => {
    if (season !== '全部' && !`${item.分类} ${item.标签.join(' ')}`.includes(season)) return false
    if (gender !== '全部' && (gender === '男生') !== item.标签.includes('男款')) return false
    return !query.trim() || `${item.服装名称} ${item.分类} ${item.标签.join(' ')} ${item.关键词}`.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))
  }), [data, gender, query, season])
  const seasonCounts = useMemo(() => Object.fromEntries(seasons.map((item) => [item, item === '全部' ? (facets?.total ?? data.length) : (facets?.seasons[item] ?? data.filter((costume) => `${costume.分类} ${costume.标签.join(' ')}`.includes(item)).length)])), [data, facets])
  const genderCounts = useMemo(() => Object.fromEntries(genders.map((item) => [item, item === '全部' ? data.length : data.filter((costume) => (item === '男生') === costume.标签.includes('男款')).length])), [data])

  return <div className="space-y-6">
    <PageHeader title="服装穿搭库" description={`当前收录 ${data.length.toLocaleString('zh-CN')} 套参考穿搭`} />
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm font-medium">性别</span>
        {genders.map((item) => <button key={item} type="button" onClick={() => setGender(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${gender === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          {item} <span className="ml-1 text-xs opacity-70">{genderCounts[item]}</span>
        </button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 text-sm font-medium">季节</span>
      {seasons.map((item) => <button key={item} type="button" onClick={() => setSeason(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${season === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
        {item === '全部' ? '全部季节' : item} <span className="ml-1 text-xs opacity-70">{seasonCounts[item]}</span>
      </button>)}
      </div>
      <label className="relative block w-full sm:w-72"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服装或标签…" className="bg-background pl-9" /></label>
    </div>
    {filtered.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filtered.map((item) => <article key={item.id} className="pet-gallery-card group flex min-w-0 flex-col overflow-hidden">
        <button type="button" className="relative aspect-[4/4.3] overflow-hidden rounded-lg bg-background text-left" onClick={() => { setSelected(item); setSelectedUrl(item.预览图 || item.原图) }}>
          <img src={item.缩略图} alt={item.服装名称} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1"><span className="rounded-full bg-background/90 px-2 py-1 text-[11px]">{item.id.startsWith('YOGA-') ? '瑜伽服' : '服装穿搭'}</span><span className="rounded-full bg-background/90 px-2 py-1 text-[11px]">{item.分类}</span></span>
        </button>
        <div className="flex min-w-0 items-center gap-2 px-1 pt-2.5 pb-1"><div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-semibold">{item.服装名称}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{item.标签.slice(0, 4).join(' · ') || item.分类}</p></div>
          <Button variant={recipe.costume?.id === item.id ? 'secondary' : 'ghost'} size="icon-sm" aria-label={recipe.costume?.id === item.id ? '已选为穿搭' : '选择穿搭'} onClick={() => setCostume(item)}><ImagePlusIcon className={`size-4 ${recipe.costume?.id === item.id ? 'text-primary' : ''}`} /></Button>
        </div>
      </article>)}
    </div> : <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground"><ShirtIcon className="size-8" /><p className="text-sm">没有找到匹配的服装参考</p></div>}
    <ImageViewer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} imageUrl={selectedUrl} title={selected?.服装名称} />
  </div>
}
