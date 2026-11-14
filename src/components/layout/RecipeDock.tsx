import { Link, useLocation } from '@tanstack/react-router'
import { CopyIcon, DicesIcon, LoaderCircleIcon, PawPrintIcon, PersonStandingIcon, ShirtIcon, SparklesIcon, Trash2Icon, UserRoundIcon, XIcon } from 'lucide-react'
import { toast } from '@/lib/notifications'
import { requestRandomRecipe } from '@/api/gallery'
import type { PetImage } from '@/types/pet'
import { poseThumbPath, referenceImageUrl, thumbnailImageUrl } from '@/lib/recipeImages'
import { workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { Button } from '@/components/ui/button'
import { buildRecipePrompt } from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'

export function RecipeDock() {
  const { pathname } = useLocation()
  const { recipe, apiConfig, isGenerating, setPortrait, setCostume, setPose, removeExtraImage, clearRecipe, randomizeRecipe } = useStudio()
  const extraCount = (recipe.extraImages || []).length
  const petReference = recipe.extraImages?.find((image) => image.role === 'pet_reference')
  const petCostume = recipe.extraImages?.find((image) => image.role === 'pet_costume')
  const workflowImages = apiConfig.activeProvider === 'comfyui' && recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson) ? Object.values(recipe.workflowImages || {}) : []
  const count = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length + extraCount + workflowImages.length

  // 在合成台、设置页、指南页隐藏底部悬浮栏，避免与页面内组件重复
  if (pathname.startsWith('/studio') || pathname.startsWith('/settings') || pathname.startsWith('/guide')) {
    return null
  }

  const handleRandom = async () => {
    try {
      const excludeIds: Record<string, string> = {}
      if (recipe.portrait?.id) excludeIds.portrait = recipe.portrait.id
      if (recipe.costume?.id) excludeIds.costume = recipe.costume.id
      if (recipe.pose?.姿势编号 || recipe.pose?.id) excludeIds.pose = recipe.pose.姿势编号 || recipe.pose.id
      const selected = await requestRandomRecipe({ excludeIds })
      randomizeRecipe({
        poses: selected.pose ? [selected.pose] : [],
        costumes: selected.costume ? [selected.costume] : [],
        portraits: selected.portrait ? [selected.portrait] : [],
        pets: [selected.pet, selected.petCostume, selected.interaction].filter((item): item is PetImage => Boolean(item)),
      })
    } catch {
      toast.error('随机素材加载失败，请稍后重试')
    }
  }

  const handleCopyPrompt = async () => {
    const text = buildRecipePrompt(recipe, apiConfig.stylePreset, workflowImages)
    await navigator.clipboard.writeText(text)
    toast.success('已复制提示词')
  }

  return (
    <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-4 w-full max-w-5xl [@media(max-height:30rem)]:static">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-lg backdrop-blur-md @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between sm:px-3.5 sm:py-2.5">
        <div className="grid min-w-0 max-w-full flex-1 grid-cols-3 gap-1.5 @md/main:grid-cols-5 sm:gap-2">
          {/* Slot 1: Portrait */}
          <div className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl bg-muted/80 p-1.5 @md/main:flex-row @md/main:items-center sm:gap-2 sm:p-2">
            {recipe.portrait ? (
              <>
                <img
                  src={referenceImageUrl(recipe.portrait.缩略图)}
                  alt={recipe.portrait.标题}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 max-w-full flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs">{recipe.portrait.发型名称}</div>
                </div>
                <button
                  type="button"
                  aria-label="清除人像参考图"
                  onClick={() => setPortrait(null)}
                  className="absolute top-1 right-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground @md/main:static"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/portraits" className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <UserRoundIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">人像</span>
              </Link>
            )}
          </div>

          {/* Slot 2: Costume */}
          <div className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl bg-muted/80 p-1.5 @md/main:flex-row @md/main:items-center sm:gap-2 sm:p-2">
            {recipe.costume ? (
              <>
                <img
                  src={referenceImageUrl(recipe.costume.缩略图)}
                  alt={recipe.costume.服装名称}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 max-w-full flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs">{recipe.costume.服装名称}</div>
                </div>
                <button
                  type="button"
                  aria-label="清除服装参考图"
                  onClick={() => setCostume(null)}
                  className="absolute top-1 right-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground @md/main:static"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/costumes" className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <ShirtIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">服装</span>
              </Link>
            )}
          </div>

          {/* Slot 3: Pose */}
          <div className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl bg-muted/80 p-1.5 @md/main:flex-row @md/main:items-center sm:gap-2 sm:p-2">
            {recipe.pose ? (
              <>
                <img
                  src={referenceImageUrl(poseThumbPath(recipe.pose))}
                  alt={recipe.pose.姿势名称}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 max-w-full flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs" title={recipe.pose.姿势名称}>{recipe.pose.姿势名称}</div>
                </div>
                <button
                  type="button"
                  aria-label="清除姿势参考图"
                  onClick={() => setPose(null)}
                  className="absolute top-1 right-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground @md/main:static"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/pet-poses" className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <PersonStandingIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">姿势</span>
              </Link>
            )}
          </div>

          {/* Slot 4: Pet */}
          <div className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl bg-muted/80 p-1.5 @md/main:flex-row @md/main:items-center sm:gap-2 sm:p-2">
            {petReference ? (
              <>
                <img src={thumbnailImageUrl(petReference.thumbnailUrl || petReference.url)} alt={petReference.name} className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8" />
                <div className="min-w-0 max-w-full flex-1"><div className="truncate text-[11px] font-medium sm:text-xs">{petReference.name}</div></div>
                <button type="button" aria-label="清除宠物参考图" onClick={() => removeExtraImage(petReference.id)} className="absolute top-1 right-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground @md/main:static"><XIcon className="size-3" /></button>
              </>
            ) : (
              <Link to="/pet-breeds" className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8"><PawPrintIcon className="size-3.5" /></div>
                <span className="truncate text-[11px] sm:text-xs">宠物</span>
              </Link>
            )}
          </div>

          {/* Slot 5: Pet costume */}
          <div className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl bg-muted/80 p-1.5 @md/main:flex-row @md/main:items-center sm:gap-2 sm:p-2">
            {petCostume ? (
              <>
                <img src={thumbnailImageUrl(petCostume.thumbnailUrl || petCostume.url)} alt={petCostume.name} className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8" />
                <div className="min-w-0 max-w-full flex-1"><div className="truncate text-[11px] font-medium sm:text-xs">{petCostume.name}</div></div>
                <button type="button" aria-label="清除宠物服装参考图" onClick={() => removeExtraImage(petCostume.id)} className="absolute top-1 right-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground @md/main:static"><XIcon className="size-3" /></button>
              </>
            ) : (
              <Link to="/pet-costumes" className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8"><ShirtIcon className="size-3.5" /></div>
                <span className="truncate text-[11px] sm:text-xs">宠物服装</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleRandom}>
            <DicesIcon className="size-3.5" />
            随机
          </Button>
          {count > 0 && (
            <>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" aria-label="复制提示词" onClick={handleCopyPrompt}>
                <CopyIcon className="size-3.5" />
                <span className="hidden md:inline">复制词</span>
              </Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label="清空参考图" onClick={clearRecipe}>
                <Trash2Icon className="size-3.5" />
              </Button>
            </>
          )}
          <Button size="sm" className="h-8 px-3 text-xs" asChild>
            <Link to="/studio">
              {isGenerating ? (
                <>
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <SparklesIcon className="size-3.5" />
                  合成 ({count})
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
