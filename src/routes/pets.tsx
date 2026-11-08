import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HeartIcon, SearchIcon, RotateCcwIcon, UploadIcon, ImagePlusIcon } from 'lucide-react'
import { Suspense, useMemo, useState, type FormEvent } from 'react'
import { petsQuery } from '@/api/pets'
import { ImageViewer } from '@/components/common/ImageViewer'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { GalleryOverview } from '@/components/gallery/GalleryOverview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/notifications'
import type { PetCategory, PetImage } from '@/types/pet'
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

export function PetGalleryPage({ initialCategory = 'all', mode = 'all', title = '图库总览', description = '猫狗姿态、人宠互动与种类参考的精选入口' }: { initialCategory?: 'all' | PetCategory; mode?: 'all' | 'breeds' | 'poses' | 'costumes'; title?: string; description?: string }) {
  const { data: images } = useSuspenseQuery(petsQuery)
  const queryClient = useQueryClient()
  const { addExtraImage, recipe } = useStudio()
  const [category, setCategory] = useState<'all' | PetCategory>(initialCategory)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('paw-pose-favorites') || '[]') as string[] } catch { return [] }
  })
  const [selected, setSelected] = useState<PetImage | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [type, setType] = useState('姿态参考')
  const [tags, setTags] = useState('')
  const [uploadCategory, setUploadCategory] = useState<PetCategory>('cat')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => ({
    all: images.length,
    cat: images.filter((image) => image.category === 'cat').length,
    dog: images.filter((image) => image.category === 'dog').length,
    interaction: images.filter((image) => image.category === 'interaction').length,
    pet_costume: images.filter((image) => image.category === 'pet_costume').length,
  }), [images])
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('zh-CN')
    return images.filter((image) => {
      if ((mode === 'breeds' || mode === 'poses') && image.category !== 'cat' && image.category !== 'dog') return false
      if (mode === 'costumes' && image.category !== 'pet_costume') return false
      if (category !== 'all' && image.category !== category) return false
      if (favoritesOnly && !favorites.includes(image.id)) return false
      return !q || `${image.title} ${image.type} ${image.tags.join(' ')}`.toLocaleLowerCase('zh-CN').includes(q)
    }).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'old' ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0))
  }, [images, category, query, sort, favoritesOnly, favorites, mode])

  const referenceRole = mode === 'costumes' ? 'pet_costume' : 'pet_reference'
  const petReferences = recipe.extraImages?.filter((image) => image.role === referenceRole) || []
  const isSelectedForStudio = (image: PetImage) => petReferences.some((reference) => reference.url === image.original)

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]
    setFavorites(next)
    localStorage.setItem('paw-pose-favorites', JSON.stringify(next))
  }

  const openAdmin = async () => {
    setAdminOpen(true)
    try {
      const response = await fetch('/api/auth')
      const data = await response.json() as { authenticated?: boolean }
      setAuthenticated(Boolean(data.authenticated))
    } catch { setAuthenticated(false) }
  }

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || '登录失败')
      setAuthenticated(true)
      setPassword('')
      toast.success('管理员已登录')
    } catch (error) { toast.error(error instanceof Error ? error.message : '无法连接上传服务') }
    finally { setBusy(false) }
  }

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    const body = new FormData()
    body.set('image', file)
    body.set('title', uploadTitle)
    body.set('category', uploadCategory)
    body.set('type', type)
    body.set('tags', tags)
    try {
      const response = await fetch('/api/pets', { method: 'POST', body })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || '上传失败')
      await queryClient.invalidateQueries({ queryKey: ['gallery', 'pets'] })
      setUploadTitle(''); setTags(''); setFile(null); setAdminOpen(false)
      toast.success('图片已加入图库')
    } catch (error) { toast.error(error instanceof Error ? error.message : '无法连接上传服务') }
    finally { setBusy(false) }
  }

  const reset = () => { setCategory(initialCategory); setQuery(''); setSort('new'); setFavoritesOnly(false) }
  const isOverview = mode === 'all' && initialCategory === 'all'

  return <>
    <PageHeader title={title} description={description} actions={<Button variant="outline" size="sm" onClick={() => void openAdmin()}><UploadIcon className="size-3.5" />上传图片</Button>} />

    {mode === 'all' && initialCategory === 'all' && <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
      <GalleryOverview images={images} onSelect={setSelected} />
    </Suspense>}

    {!isOverview && <>
    <div id="gallery-reference-list" className="flex scroll-mt-4 items-center justify-between">
      <h2 className="text-base font-semibold">{mode === 'all' && initialCategory === 'all' ? '全部宠物参考' : title}</h2>
      <span className="text-xs text-muted-foreground">共 {filtered.length.toLocaleString('zh-CN')} 张</span>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {categoryOptions.filter((option) => mode === 'costumes' ? option.id === 'pet_costume' : mode !== 'all' ? option.id === 'all' || option.id === 'cat' || option.id === 'dog' : true).map((option) => <button key={option.id} type="button" onClick={() => setCategory(option.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${category === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
        {option.label} <span className="ml-1 text-xs opacity-70">{counts[option.id]}</span>
      </button>)}
      <Button variant={favoritesOnly ? 'secondary' : 'ghost'} size="sm" className="ml-auto" onClick={() => setFavoritesOnly((value) => !value)}><HeartIcon className={`size-3.5 ${favoritesOnly ? 'fill-current text-rose-500' : ''}`} />收藏 {favorites.length}</Button>
    </div>

    <div className="gallery-toolbar grid gap-2 rounded-xl p-3 @xl/main:grid-cols-[minmax(0,1fr)_220px_auto]">
      <label className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姿态、场景或标签…" className="bg-background pl-9" /></label>
      <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">最近添加</SelectItem><SelectItem value="old">最早添加</SelectItem><SelectItem value="name">名称排序</SelectItem></SelectContent></Select>
      <Button variant="ghost" size="sm" onClick={reset}><RotateCcwIcon className="size-3.5" />重置</Button>
    </div>

    {filtered.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filtered.map((image) => <article key={image.id} className="pet-gallery-card group flex min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
        <button type="button" className="relative aspect-[4/4.3] overflow-hidden rounded-lg bg-background text-left" onClick={() => setSelected(image)}>
          <img src={image.thumbnail} alt={image.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1"><Badge className="pet-category-badge border-0">{labels[image.category]}</Badge><Badge variant="secondary" className="bg-background/90">{image.type}</Badge></span>
        </button>
        <div className="flex min-w-0 items-center gap-2 px-1 pt-2.5 pb-1"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{image.title}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{image.tags.join(' · ') || '未添加标签'}</p></div>
          <div className="flex items-center gap-0.5"><Button variant={isSelectedForStudio(image) ? 'secondary' : 'ghost'} size="icon-sm" aria-label={isSelectedForStudio(image) ? '已加入合成台' : '加入合成台'} onClick={() => addExtraImage({ name: image.title, url: image.original, role: referenceRole })}><ImagePlusIcon className={`size-4 ${isSelectedForStudio(image) ? 'text-primary' : ''}`} /></Button><Button variant="ghost" size="icon-sm" aria-label={favorites.includes(image.id) ? '取消收藏' : '收藏'} onClick={() => toggleFavorite(image.id)}><HeartIcon className={`size-4 ${favorites.includes(image.id) ? 'fill-current text-rose-500' : ''}`} /></Button></div></div>
      </article>)}
    </div> : <EmptyState title="没有找到匹配的图片" description="试试其他关键词，或重置分类和收藏筛选" />}
    </>}

    <Dialog open={adminOpen} onOpenChange={setAdminOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><ImagePlusIcon className="size-5" />图库管理</DialogTitle></DialogHeader>
      {authenticated ? <form className="grid gap-4" onSubmit={(event) => void upload(event)}>
        <div className="grid gap-2"><label htmlFor="pet-title" className="text-sm font-medium">图片名称</label><Input id="pet-title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} maxLength={80} required placeholder="例如：窗边伸懒腰" /></div>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-medium">分类<Select value={uploadCategory} onValueChange={(value) => setUploadCategory(value as PetCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cat">猫咪姿态</SelectItem><SelectItem value="dog">狗狗姿态</SelectItem><SelectItem value="interaction">人宠互动</SelectItem><SelectItem value="pet_costume">宠物服装</SelectItem></SelectContent></Select></label><label className="grid gap-2 text-sm font-medium">参考类型<Input value={type} onChange={(event) => setType(event.target.value)} maxLength={40} /></label></div>
        <div className="grid gap-2"><label htmlFor="pet-tags" className="text-sm font-medium">标签（空格分隔）</label><Input id="pet-tags" value={tags} onChange={(event) => setTags(event.target.value)} maxLength={160} placeholder="猫 窗边 慵懒" /></div>
        <div className="grid gap-2"><label htmlFor="pet-file" className="text-sm font-medium">图片文件</label><Input id="pet-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} required /><span className="text-xs text-muted-foreground">支持 JPG、PNG、WebP，单张不超过 8MB</span></div>
        {file && <div className="overflow-hidden rounded-lg bg-muted"><img className="max-h-56 w-full object-contain" src={URL.createObjectURL(file)} alt="上传预览" /></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAdminOpen(false)}>取消</Button><Button type="submit" disabled={busy || !file}>{busy ? '正在上传…' : '上传图片'}</Button></div>
      </form> : <form className="grid gap-4" onSubmit={(event) => void login(event)}><p className="text-sm text-muted-foreground">登录管理员账号后，可从网页上传并管理猫狗与人宠图片。</p><div className="grid gap-2"><label htmlFor="admin-password" className="text-sm font-medium">管理员密码</label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div><div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? '正在登录…' : '登录'}</Button></div></form>}
    </DialogContent></Dialog>

    <ImageViewer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} imageUrl={selected?.original || ''} title={selected?.title} />
  </>
}
