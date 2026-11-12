import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'

export type ReferenceSlot = 'portrait' | 'costume' | 'pose'
export type RandomScope = 'similar' | 'all'
export interface ReferencePools { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }

type ReferenceItem = PortraitItem | CostumeItem | PoseItem

export type ReferenceGender = 'male' | 'female'

export function getReferenceGender(item: ReferenceItem | null | undefined): ReferenceGender | null {
  if (!item) return null
  const record = item as ReferenceItem & {
    分区?: string
    分类?: string
    标签?: string[]
    服装名称?: string
    标题?: string
  }
  const text = [record.分区, record.分类, record.标签?.join(' '), record.服装名称, record.标题, item.检索]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const male = /男生|男款|男装|男性|男士|\bmale\b|\bmen\b|\bman\b|\bboy\b/i.test(text)
  const female = /女生|女款|女装|女性|女士|\bfemale\b|\bwomen\b|\bwoman\b|\bgirl\b/i.test(text)
  return male === female ? null : male ? 'male' : 'female'
}

function preferGender<T extends ReferenceItem>(items: T[], gender: ReferenceGender | null): T[] {
  if (!gender) return items
  const matching = items.filter((item) => getReferenceGender(item) === gender)
  return matching.length ? matching : items
}

// API catalog items currently use source: "upload" too. Only treat explicit
// upload markers or data URLs as user uploads that should be excluded.
export function isLocalUpload(item: ReferenceItem | null | undefined): boolean {
  if (!item) return false
  const record = item as ReferenceItem & { 分类?: string; 分区?: string; 体系?: string }
  if (record.分类 === '上传' || record.分区 === '上传' || record.体系 === '上传') return true
  return [item.原图, item.缩略图, '预览图' in item ? item.预览图 : '']
    .some((url) => typeof url === 'string' && url.startsWith('data:'))
}

export function randomSlot(recipe: RecipeState, slot: ReferenceSlot, scope: RandomScope, pools: ReferencePools, useDepth: boolean): RecipeState | null {
  const current = recipe[slot]
  if (scope === 'similar' && isLocalUpload(current)) return null
  let candidates: Array<PortraitItem | CostumeItem | PoseItem>
  if (slot === 'portrait') {
    const selected = recipe.portrait
    candidates = (pools.portraits || []).filter((item) => !isLocalUpload(item) && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.分区 === selected.分区 && item.发长 === selected.发长)))
  } else if (slot === 'costume') {
    const selected = recipe.costume
    candidates = (pools.costumes || []).filter((item) => !isLocalUpload(item) && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.source === selected.source && (item.一级分类 || '现实') === (selected.一级分类 || '现实') && item.分类 === selected.分类)))
  } else {
    const selected = recipe.pose
    candidates = (pools.poses || []).filter((item) => !isLocalUpload(item) && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.体系 === selected.体系 && item.分类 === selected.分类)))
  }
  const linkedGender = slot === 'portrait' ? getReferenceGender(recipe.costume) : slot === 'costume' ? getReferenceGender(recipe.portrait) : null
  candidates = preferGender(candidates, linkedGender)
  if (linkedGender && !candidates.some((item) => getReferenceGender(item) === linkedGender)) {
    const linkedPool = (slot === 'portrait' ? pools.portraits : slot === 'costume' ? pools.costumes : pools.poses) || []
    const fallback = linkedPool.filter((item) => !isLocalUpload(item) && item.id !== current?.id && getReferenceGender(item) === linkedGender)
    if (fallback.length) candidates = fallback
  }
  if (!candidates.length) return null
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  return { ...recipe, [slot]: slot === 'pose' ? { ...picked, useDepth } : picked }
}
