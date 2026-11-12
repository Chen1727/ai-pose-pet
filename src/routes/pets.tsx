import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HeartIcon, SearchIcon, RotateCcwIcon, ImagePlusIcon } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { costumesQuery, galleryFacetsQuery, portraitsQuery } from '@/api/gallery'
import { petsQuery } from '@/api/pets'
import { ImageViewer } from '@/components/common/ImageViewer'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { GalleryOverview } from '@/components/gallery/GalleryOverview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { PetCategory, PetImage } from '@/types/pet'
import type { PoseItem } from '@/types/gallery'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/pets')({
  staticData: { title: '图库总览' },
  loader: ({ context }) => context.queryClient.ensureQueryData(petsQuery),
  pendingComponent: () => <Skeleton className="h-[540px] rounded-xl" />,
  component: () => <PetGalleryPage />,
})

const categoryOptions: { id: 'all' | PetCategory; label: string }[] = [
  { id: 'all', label: '全部图片' },
  { id: 'cat', label: '猫咪姿态' },
  { id: 'dog', label: '狗狗姿态' },
  { id: 'interaction', label: '人宠互动' },
  { id: 'pet_costume', label: '宠物服装' },
]
const labels: Record<PetCategory, string> = { cat: '猫咪', dog: '狗狗', interaction: '人宠互动', pet_costume: '宠物服装' }
const seasons = ['全部季节', '春季', '夏季', '秋季', '冬季'] as const
const petSpeciesFilters = ['全部', '猫', '狗'] as const
const poseFilters = ['全部', '狗狗姿势', '猫猫姿势', '站立', '行走', '坐姿', '趴卧', '伸展', '技巧'] as const
const catBreedFilters = ['小型', '中型', '大型', '短毛', '长毛', '重点色', '无毛', '卷毛', '原生'] as const
const dogBreedFilters = ['玩具', '小型', '中型', '大型', '巨型', '玩赏', '梗类', '猎犬', '牧羊', '枪猎', '原始', '工作'] as const

export function PetGalleryPage({ initialCategory = 'all', mode = 'all', title = '图库总览', description = '猫狗种类、宠物姿势、宠物服装和人宠互动的精选入口' }: { initialCategory?: 'all' | PetCategory; mode?: 'all' | 'breeds' | 'poses' | 'costumes' | 'interactions'; title?: string; description?: string }) {
  const { data: images } = useSuspenseQuery(petsQuery)
  // Human galleries are only needed for the overview counters. Do not block
  // pet sub-galleries on those extra requests.
  const { data: costumes = [] } = useQuery({ ...costumesQuery, enabled: mode === 'all' })
  const { data: portraits = [] } = useQuery({ ...portraitsQuery, enabled: mode === 'all' })
  const facetLibrary = mode === 'breeds' ? 'pet-breeds' : mode === 'poses' ? 'pet-poses' : mode === 'costumes' ? 'pet-costumes' : mode === 'interactions' ? 'pet-interactions' : null
  const { data: facets } = useQuery({ ...galleryFacetsQuery(facetLibrary || 'pet-breeds'), enabled: Boolean(facetLibrary) })
  const { addExtraImage, recipe, setPose, replaceExtraImage, removeExtraImage } = useStudio()
  const [category, setCategory] = useState<'all' | PetCategory>(() => mode === 'interactions' ? 'all' : initialCategory)
  const [detailCategory, setDetailCategory] = useState('全部')
  const [season, setSeason] = useState<(typeof seasons)[number]>('全部季节')
  const [petSpecies, setPetSpecies] = useState<(typeof petSpeciesFilters)[number]>('全部')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('paw-pose-favorites') || '[]') as string[] } catch { return [] }
  })
  const [selected, setSelected] = useState<PetImage | null>(null)
  const [selectedUrl, setSelectedUrl] = useState('')
  const [viewSelection, setViewSelection] = useState<Record<string, string>>({})

  const scopedImages = useMemo(() => images.filter((image) => {
    if (mode === 'breeds') return image.kind === 'breed'
    if (mode === 'poses') return image.kind === 'pose'
    if (mode === 'costumes') return image.kind === 'costume' && image.category === 'pet_costume'
    if (mode === 'interactions') return image.kind === 'interaction' && image.category === 'interaction'
    return true
  }), [images, mode])
  const counts = useMemo(() => ({
    all: facets?.total ?? scopedImages.length,
    cat: facets?.species.cat ?? scopedImages.filter((image) => mode === 'interactions' ? image.tags.includes('猫') : image.category === 'cat').length,
    dog: facets?.species.dog ?? scopedImages.filter((image) => mode === 'interactions' ? image.tags.includes('狗') : image.category === 'dog').length,
    interaction: scopedImages.filter((image) => image.category === 'interaction').length,
    pet_costume: scopedImages.filter((image) => image.category === 'pet_costume').length,
  }), [scopedImages, mode])
  const petSpeciesCounts = useMemo(() => ({
    全部: facets?.total ?? scopedImages.length,
    猫: facets?.species.cat ?? scopedImages.filter((image) => image.tags.some((tag) => tag.includes('猫'))).length,
    狗: facets?.species.dog ?? scopedImages.filter((image) => image.tags.some((tag) => tag.includes('狗'))).length,
  }), [facets, scopedImages])
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('zh-CN')
    return scopedImages.filter((image) => {
      if (mode === 'interactions' && category !== 'all' && !image.tags.includes(category === 'cat' ? '猫' : '狗')) return false
      if (mode !== 'interactions' && category !== 'all' && image.category !== category) return false
      if (mode === 'poses' && detailCategory !== '全部' && (detailCategory === '猫猫姿势' ? image.category !== 'cat' : detailCategory === '狗狗姿势' ? image.category !== 'dog' : image.type !== detailCategory)) return false
      if (mode === 'breeds' && detailCategory !== '全部' && !image.subtitle?.split(' · ').slice(0, 2).includes(detailCategory)) return false
      if (mode === 'costumes' && season !== '全部季节' && !`${image.type} ${image.tags.join(' ')}`.includes(season)) return false
      if (mode === 'costumes' && petSpecies !== '全部' && !image.tags.some((tag) => tag.includes(petSpecies))) return false
      if (favoritesOnly && !favorites.includes(image.id)) return false
      return !q || `${image.title} ${image.type} ${image.tags.join(' ')}`.toLocaleLowerCase('zh-CN').includes(q)
    }).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'old' ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0))
  }, [scopedImages, category, detailCategory, season, petSpecies, query, sort, favoritesOnly, favorites, mode])

  const referenceRole = mode === 'costumes' ? 'pet_costume' : 'pet_reference'
  const selectsPose = mode === 'poses' || mode === 'interactions'
  const petReferences = recipe.extraImages?.filter((image) => image.role === referenceRole) || []
  const activeView = (image: PetImage) => image.views?.find((view) => view.id === viewSelection[image.id]) || image.views?.[0]
  const toPoseItem = (image: PetImage, original: string, thumbnail: string, angle: string): PoseItem => ({
    id: image.id,
    体系: mode === 'interactions' ? '人宠互动' : image.category === 'cat' ? '猫猫姿势' : '狗狗姿势',
    姿势编号: image.id,
    分类: image.type,
    姿势名称: image.title,
    角度: angle,
    缩略图: thumbnail,
    原图: original,
    检索: `${image.title} ${image.tags.join(' ')}`,
  })
  const isSelectedForStudio = (image: PetImage, original = image.original, angle = image.type) => selectsPose
    ? recipe.pose?.id === image.id && recipe.pose.角度 === angle
    : petReferences.some((reference) => reference.url === original)
  const selectForStudio = (image: PetImage, original: string, thumbnail: string, angle: string) => {
    if (selectsPose) setPose(toPoseItem(image, original, thumbnail, angle))
    else {
      const currentReferences = petReferences
      const current = currentReferences[0]
      const next = { name: image.title, url: original, role: referenceRole as 'pet_reference' | 'pet_costume' }
      if (current) {
        replaceExtraImage(current.id, next)
        for (const duplicate of currentReferences.slice(1)) removeExtraImage(duplicate.id)
      } else addExtraImage(next)
    }
  }

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]
    setFavorites(next)
    localStorage.setItem('paw-pose-favorites', JSON.stringify(next))
  }

  const reset = () => { setCategory(initialCategory); setDetailCategory('全部'); setSeason('全部季节'); setPetSpecies('全部'); setQuery(''); setSort('new'); setFavoritesOnly(false) }
  const isOverview = mode === 'all' && initialCategory === 'all'

  return <>
    <PageHeader title={title} description={description} />

    {mode === 'all' && initialCategory === 'all' && <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
      <GalleryOverview images={images} costumeCount={costumes.length} portraitCount={portraits.length} onSelect={(image) => { setSelected(image); setSelectedUrl(image.original) }} />
    </Suspense>}

    {!isOverview && <>
    <div id="gallery-reference-list" className="flex scroll-mt-4 items-center justify-between">
      <h2 className="text-base font-semibold">{mode === 'all' && initialCategory === 'all' ? '全部宠物参考' : title}</h2>
      <span className="text-xs text-muted-foreground">共 {filtered.length.toLocaleString('zh-CN')} 张</span>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {mode === 'costumes' ? <>
        <div className="flex basis-full flex-wrap items-center gap-2">
          <span className="w-12 text-sm font-medium">种类</span>
          {petSpeciesFilters.map((item) => <button key={item} type="button" onClick={() => setPetSpecies(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${petSpecies === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {item} <span className="ml-1 text-xs opacity-70">{petSpeciesCounts[item]}</span>
          </button>)}
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2">
          <span className="w-12 text-sm font-medium">季节</span>
          {seasons.map((item) => <button key={item} type="button" onClick={() => setSeason(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${season === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {item} <span className="ml-1 text-xs opacity-70">{item === '全部季节' ? counts.pet_costume : scopedImages.filter((image) => `${image.type} ${image.tags.join(' ')}`.includes(item)).length}</span>
          </button>)}
        </div>
      </> : mode === 'interactions' ? (['all', 'dog', 'cat'] as const).map((item) => {
        const id = item === 'all' ? 'all' : item
        const count = item === 'all' ? counts.interaction : item === 'dog' ? counts.dog : counts.cat
        const label = item === 'all' ? '全部' : item === 'dog' ? '狗' : '猫'
        return <button key={item} type="button" onClick={() => setCategory(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${category === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{label} <span className="ml-1 text-xs opacity-70">{count}</span></button>
      }) : mode === 'poses' ? poseFilters.map((item) => <button key={item} type="button" onClick={() => setDetailCategory(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${detailCategory === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item} <span className="ml-1 text-xs opacity-70">{item === '全部' ? counts.all : scopedImages.filter((image) => item === '猫猫姿势' ? image.category === 'cat' : item === '狗狗姿势' ? image.category === 'dog' : image.type === item).length}</span></button>) : categoryOptions.filter((option) => mode === 'breeds' ? option.id === 'all' || option.id === 'cat' || option.id === 'dog' : mode !== 'all' ? option.id === 'all' || option.id === 'cat' || option.id === 'dog' : true).map((option) => <button key={option.id} type="button" onClick={() => { setCategory(option.id); setDetailCategory('全部') }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${category === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
        {option.label} <span className="ml-1 text-xs opacity-70">{counts[option.id]}</span>
      </button>)}
      {mode === 'breeds' && (category === 'cat' || category === 'dog') && <div className="flex basis-full flex-wrap gap-2 pt-1">
        {['全部', ...(category === 'cat' ? catBreedFilters : dogBreedFilters)].map((item) => <button key={item} type="button" onClick={() => setDetailCategory(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${detailCategory === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item} <span className="ml-1 text-xs opacity-70">{item === '全部' ? counts[category] : scopedImages.filter((image) => image.category === category && image.subtitle?.split(' · ').slice(0, 2).includes(item)).length}</span></button>)}
      </div>}
      <Button variant={favoritesOnly ? 'secondary' : 'ghost'} size="sm" className="ml-auto" onClick={() => setFavoritesOnly((value) => !value)}><HeartIcon className={`size-3.5 ${favoritesOnly ? 'fill-current text-rose-500' : ''}`} />收藏 {favorites.length}</Button>
    </div>

    <div className="gallery-toolbar grid gap-2 rounded-xl p-3 @xl/main:grid-cols-[minmax(0,1fr)_220px_auto]">
      <label className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姿态、场景或标签…" className="bg-background pl-9" /></label>
      <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">最近添加</SelectItem><SelectItem value="old">最早添加</SelectItem><SelectItem value="name">名称排序</SelectItem></SelectContent></Select>
      <Button variant="ghost" size="sm" onClick={reset}><RotateCcwIcon className="size-3.5" />重置</Button>
    </div>

    {filtered.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filtered.map((image) => {
        const view = activeView(image)
        const thumbnail = view?.thumbnail || image.thumbnail
        const original = view?.original || image.original
        return <article key={image.id} className="pet-gallery-card group flex min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
        <button type="button" className="relative aspect-[4/4.3] overflow-hidden rounded-lg bg-background text-left" onClick={() => { setSelected(image); setSelectedUrl(original) }}>
          <img src={thumbnail} alt={image.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1"><Badge className="pet-category-badge border-0">{labels[image.category]}</Badge><Badge variant="secondary" className="bg-background/90">{image.type}</Badge></span>
        </button>
        {image.views && image.views.length > 1 && <div className="flex flex-wrap gap-1 px-1 pt-2">
          {image.views.map((item) => <button key={item.id} type="button" className={`rounded border px-2 py-1 text-[11px] transition ${item.id === view?.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`} onClick={() => setViewSelection((current) => ({ ...current, [image.id]: item.id }))}>{item.label}</button>)}
        </div>}
          <div className="flex min-w-0 items-center gap-2 px-1 pt-2.5 pb-1"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{image.title}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{image.subtitle || image.tags.join(' · ') || '未添加标签'}</p></div>
          <div className="flex items-center gap-0.5"><Button variant={isSelectedForStudio(image, original, view?.label || image.type) ? 'secondary' : 'ghost'} size="icon-sm" aria-label={isSelectedForStudio(image, original, view?.label || image.type) ? '已加入合成台' : '加入合成台'} onClick={() => selectForStudio(image, original, thumbnail, view?.label || image.type)}><ImagePlusIcon className={`size-4 ${isSelectedForStudio(image, original, view?.label || image.type) ? 'text-primary' : ''}`} /></Button><Button variant="ghost" size="icon-sm" aria-label={favorites.includes(image.id) ? '取消收藏' : '收藏'} onClick={() => toggleFavorite(image.id)}><HeartIcon className={`size-4 ${favorites.includes(image.id) ? 'fill-current text-rose-500' : ''}`} /></Button></div></div>
      </article>})}
    </div> : <EmptyState title="没有找到匹配的图片" description="试试其他关键词，或重置分类和收藏筛选" />}
    </>}

    <ImageViewer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} imageUrl={selectedUrl || selected?.original || ''} title={selected?.title} />
  </>
}
