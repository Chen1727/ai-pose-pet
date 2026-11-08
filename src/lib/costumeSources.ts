import type { CostumeItem } from '@/types/gallery'

export function selectCostumeView(item: CostumeItem, id = item.selectedView || 'front'): CostumeItem {
  const view = item.views?.find((view) => view.id === id) || item.views?.find((view) => view.id === 'front') || item.views?.[0]
  return view ? { ...item, selectedView: view.id, 缩略图: view.缩略图, 预览图: view.预览图, 原图: view.原图 } : item
}
