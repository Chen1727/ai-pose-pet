import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HeartIcon, SearchIcon, RotateCcwIcon, ImagePlusIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { galleryFacetsQuery, galleryRecommendationsQuery, galleryStatsQuery } from '@/api/gallery'
import { petGalleryQuery, type PetLibraryId } from '@/api/pets'
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
  pendingComponent: () => <Skeleton className="h-[540px] rounded-xl" />,
  component: () => <PetGalleryPage />,
})
const labels: Record<PetCategory, string> = { cat: '猫咪', dog: '狗狗', interaction: '人宠互动', pet_costume: '宠物服装' }
const libraryForMode: Partial<Record<NonNullable<PetGalleryPageProps['mode']>, PetLibraryId>> = {
  breeds: 'pet-breeds', poses: 'pet-poses', costumes: 'pet-costumes', interactions: 'pet-interactions',
}
type PetGalleryPageProps = {
  initialCategory?: 'all' | PetCategory
  mode?: 'all' | 'breeds' | 'poses' | 'costumes' | 'interactions'
  title?: string
  description?: string
}
export function PetGalleryPage({ initialCategory = 'all', mode = 'all', title = '图库总览', description = '猫狗种类、宠物姿势、宠物服装和人宠互动的精选入口' }: PetGalleryPageProps) {
  const libraryId = libraryForMode[mode]
  const isOverview = mode === 'all' && initialCategory === 'all'
  const galleryQuery = useInfiniteQuery({ ...petGalleryQuery(libraryId || 'pet-breeds'), enabled: Boolean(libraryId) })
  const images = galleryQuery.data?.pages.flatMap((page) => page.items) || []
  const facetLibrary = mode === 'breeds' ? 'pet-breeds' : mode === 'poses' ? 'pet-poses' : mode === 'costumes' ? 'pet-costumes' : mode === 'interactions' ? 'pet-interactions' : null
  const { data: facets } = useQuery({ ...galleryFacetsQuery(facetLibrary || 'pet-breeds'), enabled: Boolean(facetLibrary) })
  const { data: stats } = useQuery({ ...galleryStatsQuery, enabled: isOverview })
  const { data: recommendations = [] } = useQuery({ ...galleryRecommendationsQuery, enabled: isOverview })
  const countFor = (libraryId: string) => stats?.libraries.find((library) => library.id === libraryId)?.group_count || 0
  const overviewCounts = {
    breeds: countFor('pet-breeds'),
    poses: countFor('pet-poses'),
    costumes: countFor('pet-costumes'),
    interaction: countFor('pet-interactions'),
    humanCostumes: countFor('costumes'),
    portraits: countFor('portraits'),
  }
  const { addExtraImage, recipe, setPose, replaceExtraImage, removeExtraImage } = useStudio()
  const [category, setCategory] = useState<'all' | PetCategory>(() => mode === 'interactions' ? 'all' : initialCategory)
  const [detailCategory, setDetailCategory] = useState('全部')
  const [season, setSeason] = useState('全部季节')
  const [petSpecies, setPetSpecies] = useState('全部')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('paw-pose-favorites') || '[]') as string[] } catch { return [] }
  })
  const [selected, setSelected] = useState<PetImage | null>(null)
  const [selectedUrl, setSelectedUrl] = useState('')
  const [viewSelection, setViewSelection] = useState<Record<string, string>>({})

  const scopedImages = images
  const facetOptions = facets?.category_options || []
  const speciesOptions = ['全部', ...facetOptions.filter((item) => item.category_type === 'species').map((item) => item.name)]
  const speciesValue = (label: string) => facetOptions.find((item) => item.category_type === 'species' && item.name === label)?.value
  const seasonOptions = ['全部季节', ...facetOptions.filter((item) => item.category_type === 'season').map((item) => item.name)]
  const breedOptions = facetOptions.filter((item) => item.category_type === 'size' || item.category_type === 'coat').map((item) => item.name)
  const categoryOptions = [{ id: 'all' as const, label: '全部图片' }, ...(facetOptions.filter((item) => item.category_type === 'species').map((item) => ({ id: item.value as 'cat' | 'dog', label: item.name })))]
  const facetCount = (value: string, type?: string) => type === 'species'
    ? facets?.species[value] ?? 0
    : type === 'season'
      ? facets?.seasons[value] ?? 0
      : facets?.categories[value] ?? facetOptions.find((item) => item.value === value)?.image_count ?? 0
  const counts = useMemo(() => ({
    all: facets?.total ?? galleryQuery.data?.pages[0]?.total ?? scopedImages.length,
    cat: facets?.species.cat ?? scopedImages.filter((image) => image.species === 'cat' || image.category === 'cat').length,
    dog: facets?.species.dog ?? scopedImages.filter((image) => image.species === 'dog' || image.category === 'dog').length,
    interaction: facets?.total ?? scopedImages.filter((image) => image.category === 'interaction').length,
    pet_costume: facets?.total ?? scopedImages.filter((image) => image.category === 'pet_costume').length,
  }), [facets, scopedImages])
  const petSpeciesCounts = useMemo(() => ({
    全部: facets?.total ?? galleryQuery.data?.pages[0]?.total ?? scopedImages.length,
    猫: facets?.species.cat ?? scopedImages.filter((image) => image.species === 'cat' || image.tags.some((tag) => tag.includes('猫'))).length,
    狗: facets?.species.dog ?? scopedImages.filter((image) => image.species === 'dog' || image.tags.some((tag) => tag.includes('狗'))).length,
  }), [facets, scopedImages])
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('zh-CN')
    return scopedImages.filter((image) => {
      if (mode === 'interactions' && category !== 'all' && image.species !== category) return false
      if (mode !== 'interactions' && category !== 'all' && image.category !== category) return false
      if (mode === 'poses' && detailCategory !== '全部' && (detailCategory === 'cat' ? image.species !== 'cat' : detailCategory === 'dog' ? image.species !== 'dog' : image.type !== detailCategory)) return false
      if (mode === 'breeds' && detailCategory !== '全部' && !`${image.subtitle || ''} ${image.tags.join(' ')}`.includes(detailCategory)) return false
      if (mode === 'costumes' && season !== '全部季节' && !`${image.type} ${image.tags.join(' ')}`.includes(season)) return false
      if (mode === 'costumes' && petSpecies !== '全部' && image.species !== speciesValue(petSpecies)) return false
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
      const next = { name: image.title, url: original, thumbnailUrl: thumbnail, role: referenceRole as 'pet_reference' | 'pet_costume', sourceId: image.id, species: image.species }
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
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !galleryQuery.hasNextPage || galleryQuery.isFetchingNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void galleryQuery.fetchNextPage()
    }, { rootMargin: '480px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [galleryQuery.hasNextPage, galleryQuery.isFetchingNextPage, galleryQuery.fetchNextPage])

  return <>
    <PageHeader title={title} description={description} />

    {mode === 'all' && initialCategory === 'all' && <GalleryOverview images={images} recommendations={recommendations} costumeCount={overviewCounts.humanCostumes} portraitCount={overviewCounts.portraits} libraryCounts={overviewCounts} onSelect={(image) => { setSelected(image); setSelectedUrl(image.original) }} />}

    {!isOverview && <>
    <div id="gallery-reference-list" className="flex scroll-mt-4 items-center justify-between">
      <h2 className="text-base font-semibold">{mode === 'all' && initialCategory === 'all' ? '全部宠物参考' : title}</h2>
      <span className="text-xs text-muted-foreground">共 {filtered.length.toLocaleString('zh-CN')} 张</span>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {mode === 'costumes' ? <>
        <div className="flex basis-full flex-wrap items-center gap-2">
          <span className="w-12 text-sm font-medium">种类</span>
          {speciesOptions.map((item) => <button key={item} type="button" onClick={() => setPetSpecies(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${petSpecies === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {item} <span className="ml-1 text-xs opacity-70">{item === '全部' ? petSpeciesCounts.全部 : facetCount(speciesValue(item) || '', 'species')}</span>
          </button>)}
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2">
          <span className="w-12 text-sm font-medium">季节</span>
          {seasonOptions.map((item) => <button key={item} type="button" onClick={() => setSeason(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${season === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {item} <span className="ml-1 text-xs opacity-70">{item === '全部季节' ? counts.pet_costume : facetCount(item, 'season')}</span>
          </button>)}
        </div>
      </> : mode === 'interactions' ? [{ id: 'all', label: '全部' }, ...facetOptions.filter((item) => item.category_type === 'species').map((item) => ({ id: item.value, label: item.name }))].map((item) => {
        const id = item.id === 'cat' || item.id === 'dog' ? item.id : 'all'
        const count = item.id === 'all' ? counts.interaction : facetCount(item.id, 'species')
        return <button key={item.id} type="button" onClick={() => setCategory(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${category === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item.label} <span className="ml-1 text-xs opacity-70">{count}</span></button>
      }) : mode === 'poses' ? [{ value: '全部', label: '全部' }, ...facetOptions.filter((item) => item.category_type === 'species' || item.category_type === 'category').map((item) => ({ value: item.category_type === 'species' ? item.value : item.name, label: item.name }))].map((item) => <button key={item.value} type="button" onClick={() => setDetailCategory(item.value)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${detailCategory === item.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item.label} <span className="ml-1 text-xs opacity-70">{item.value === '全部' ? counts.all : facetCount(item.value, item.value === 'cat' || item.value === 'dog' ? 'species' : undefined)}</span></button>) : categoryOptions.filter((option) => mode === 'breeds' ? option.id === 'all' || option.id === 'cat' || option.id === 'dog' : mode !== 'all' ? option.id === 'all' || option.id === 'cat' || option.id === 'dog' : true).map((option) => <button key={option.id} type="button" onClick={() => { setCategory(option.id); setDetailCategory('全部') }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${category === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
        {option.label} <span className="ml-1 text-xs opacity-70">{counts[option.id]}</span>
      </button>)}
      {mode === 'breeds' && (category === 'cat' || category === 'dog') && <div className="flex basis-full flex-wrap gap-2 pt-1">
        {['全部', ...breedOptions].map((item) => <button key={item} type="button" onClick={() => setDetailCategory(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${detailCategory === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item} <span className="ml-1 text-xs opacity-70">{item === '全部' ? counts[category] : facetCount(item)}</span></button>)}
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
    </div> : <EmptyState title="没有找到匹配的图片" description={galleryQuery.isLoading ? '正在加载图片…' : '试试其他关键词，或重置分类和收藏筛选'} />}
    {!isOverview && <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center text-sm text-muted-foreground">
      {galleryQuery.isFetchingNextPage && <><LoaderCircleIcon className="mr-2 size-4 animate-spin" />正在加载更多…</>}
      {!galleryQuery.isFetchingNextPage && galleryQuery.hasNextPage && <Button variant="outline" onClick={() => void galleryQuery.fetchNextPage()}>加载更多</Button>}
      {!galleryQuery.isFetchingNextPage && !galleryQuery.hasNextPage && filtered.length > 0 && <span>已加载全部 {galleryQuery.data?.pages[0]?.total ?? filtered.length} 张</span>}
    </div>}
    </>}

    <ImageViewer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} imageUrl={selectedUrl || selected?.original || ''} title={selected?.title} />
  </>
}
