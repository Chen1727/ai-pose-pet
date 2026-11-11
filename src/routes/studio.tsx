import { ReferenceComparisonDialog } from '@/components/common/ReferenceComparisonDialog'
import { ImageViewer } from '@/components/common/ImageViewer'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ChevronUpIcon,
  CodeXmlIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  FileUpIcon,
  ImagePlusIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  PawPrintIcon,
  ScanSearchIcon,
  RotateCcwIcon,
  ShirtIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/lib/notifications'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { petsQuery } from '@/api/pets'
import { Field, Section } from '@/components/common/FormSection'
import { ComfyConnectionStatus } from '@/components/studio/ComfyConnectionStatus'
import { WorkflowParameters } from '@/components/studio/WorkflowParameters'
import { applyWorkflowOverrides, validateReferenceCombinations, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  autoDetectComfyMappings,
  buildRecipePrompt,
  type ComfyCheckResult,
  type ComfyPresetId,
  checkComfyWorkflow,
  COMFYUI_WORKFLOW_TEMPLATES,
  detectComfyUi,
  fileToDataUrl,
  fetchComfyObjectInfo,
  parseComfyWorkflowNodes,
  PROVIDER_META,
  stitchRecipeCanvas,
  STYLE_PRESETS,
} from '@/services/aiGenerator'
import { poseImagePath, poseThumbPath, referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import { useStudio } from '@/store/studioStore'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { selectCostumeView } from '@/lib/costumeSources'
import type {
  ComfyUiParams,
  DoubaoParams,
  GeminiParams,
  GenerationHistoryItem,
  GptParams,
  ImagePassMode,
  ImageProviderId,
  QwenParams,
} from '@/types/gallery'
import type { PetImage } from '@/types/pet'

export const Route = createFileRoute('/studio')({
  staticData: { title: 'AI 合成台' },
  component: StudioPage,
})

const PROVIDER_LIST: ImageProviderId[] = ['gemini', 'gpt', 'qwen', 'doubao', 'comfyui']

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function interactionPoseItems(images: PetImage[]) {
  return images
    .filter((image) => image.category === 'interaction')
    .flatMap((image) => (image.views?.length ? image.views : [{ id: 'default', label: image.type, thumbnail: image.thumbnail, original: image.original }]).map((view) => ({
      id: `${image.id}-${view.id}`,
      体系: '人宠互动',
      姿势编号: image.id,
      分类: image.type,
      姿势名称: image.title,
      角度: view.label,
      缩略图: view.thumbnail,
      原图: view.original,
      检索: `${image.title} ${image.tags.join(' ')}`,
    })))
}

function StudioPage() {
  const {
    hydrated, activeTask, resumeGeneration, stopTracking,
    recipe,
    apiConfig,
    history,
    customPrompt,
    setCustomPrompt,
    previewUrl,
    isGenerating,
    generatingModel,
    generationProgress,
    generationError,
    startGeneration,
    setPortrait,
    setCostume,
    setPose,
    addExtraImage,
    replaceExtraImage,
    removeExtraImage,
    updateExtraImageName,
    updateApiConfig,
    updateProviderConfig,
    updateGptParams,
    updateGeminiParams,
    updateQwenParams,
    updateDoubaoParams,
    updateComfyUiParams,
    randomizeRecipe,
    randomizeSlot,
    removeHistoryItem,
    clearHistory,
  } = useStudio()
  const [comparisonResult, setComparisonResult] = useState<GenerationHistoryItem | null>(null)
  const previewResult = history.find((item) => item.imageUrl === previewUrl)
  const qc = useQueryClient()
  const comfyFileInputRef = useRef<HTMLInputElement | null>(null)
  const slotInputRef = useRef<HTMLInputElement | null>(null)
  const uploadSlotRef = useRef<'portrait' | 'costume' | 'pose' | 'pet' | 'pet_costume'>('portrait')
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [randomizingSlot, setRandomizingSlot] = useState<ReferenceSlot | null>(null)
  const [randomScopes, setRandomScopes] = useState<Record<ReferenceSlot, RandomScope>>({ portrait: 'similar', costume: 'similar', pose: 'similar' })
  const [petRandomScopes, setPetRandomScopes] = useState<Record<'pet_reference' | 'pet_costume', RandomScope>>({ pet_reference: 'similar', pet_costume: 'similar' })
  const [randomizingPetSlot, setRandomizingPetSlot] = useState<'pet_reference' | 'pet_costume' | null>(null)
  const costumeViews = recipe.costume?.views?.filter((view) => view.原图 && view.缩略图) || []
  const [showReferenceErrors, setShowReferenceErrors] = useState(false)
  const referenceErrorsRef = useRef<HTMLDivElement | null>(null)

  // Older saved recipes point to the removed local gallery. Rebind them to the API item.
  useEffect(() => {
    const savedCostume = recipe.costume
    const savedUrl = savedCostume?.原图 || savedCostume?.预览图 || savedCostume?.缩略图 || ''
    const isLocalAsset = /^\/?img\//i.test(savedUrl)
    const isCatalogAsset = savedCostume?.source === 'upload' && savedCostume.分类 !== '上传' && !savedUrl.startsWith('data:')
    if (!hydrated || !savedCostume || (!isLocalAsset && !isCatalogAsset)) return
    let cancelled = false
    void qc.ensureQueryData(costumesQuery).then((items) => {
      if (cancelled) return
      const match = items.find((item) => item.id === savedCostume.id || item.服装名称 === savedCostume.服装名称)
      if (!match) {
        if (isLocalAsset) setCostume(null)
        return
      }
      const currentView = savedCostume.selectedView || 'front'
      const next = selectCostumeView(match, currentView)
      if (isLocalAsset || next.原图 !== savedCostume.原图 || next.缩略图 !== savedCostume.缩略图) setCostume(next)
    }).catch(() => {
      if (!cancelled) toast.error('服装参考图加载失败，请重新选择')
    })
    return () => { cancelled = true }
  }, [hydrated, qc, recipe.costume, setCostume])

  const activeProvider = apiConfig.activeProvider
  const providerMeta = PROVIDER_META[activeProvider]
  const providerCfg = apiConfig.providers[activeProvider]

  const activeWorkflowImages = activeProvider === 'comfyui' && recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson) ? Object.values(recipe.workflowImages || {}) : []
  const defaultPrompt = buildRecipePrompt(recipe, apiConfig.stylePreset, activeWorkflowImages)
  const prompt = customPrompt ?? defaultPrompt
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [showComfyJsonModal, setShowComfyJsonModal] = useState(false)
  const [comfyCheck, setComfyCheck] = useState<(ComfyCheckResult & { info?: string }) | null>(null)
  const [checkingComfy, setCheckingComfy] = useState(false)

  const parsedComfyNodes = useMemo(
    () => parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson),
    [apiConfig.comfyuiParams.workflowJson]
  )

  const handleSelectComfyPreset = (preset: ComfyUiParams['workflowPreset']) => {
    setComfyCheck(null)
    if (preset === 'custom') {
      updateComfyUiParams({ workflowPreset: 'custom' })
      return
    }
    const tpl = COMFYUI_WORKFLOW_TEMPLATES[preset]
    updateComfyUiParams({
      workflowPreset: preset,
      workflowJson: JSON.stringify(tpl.workflow, null, 2),
      ...tpl.defaults,
    })
    toast.success(`已切换为：${tpl.label}`)
  }

  // 自动识别 ComfyUI 地址 + 检测工作流所需节点/模型是否在本机存在
  const handleCheckComfy = async () => {
    setCheckingComfy(true)
    setComfyCheck(null)
    try {
      const cfg = apiConfig.providers.comfyui
      const found = await detectComfyUi(cfg.baseUrl, cfg.apiKey)
      if (!found) {
        setComfyCheck({
          ok: false,
          errors: [
            `未找到可用的 ComfyUI 服务（已尝试：${cfg.baseUrl || '默认地址'}、127.0.0.1:8000、127.0.0.1:8188）。请确认 ComfyUI 已启动，并检查跨域 (CORS) 设置。`,
          ],
          warnings: [],
          fixes: [],
        })
        return
      }
      if (found.baseUrl !== cfg.baseUrl.trim().replace(/\/+$/, '')) {
        updateProviderConfig('comfyui', { baseUrl: found.baseUrl })
        toast.success(`已自动识别 ComfyUI 地址：${found.baseUrl}`)
      }
      const cp = apiConfig.comfyuiParams
      const result = await checkComfyWorkflow(found.baseUrl, cfg.apiKey, cp.workflowJson, [
        cp.portraitNodeId,
        cp.costumeNodeId,
        cp.poseNodeId,
        cp.petNodeId,
        cp.petCostumeNodeId,
        cp.stitchedNodeId,
      ])
      // 自动修复仅用于提交副本，保留导入的原始 API。
      setComfyCheck({ ...result, info: `${found.info}（${found.baseUrl}）` })
    } catch (e) {
      setComfyCheck({ ok: false, errors: [e instanceof Error ? e.message : '检测失败'], warnings: [], fixes: [] })
    } finally {
      setCheckingComfy(false)
    }
  }

  const handleComfyFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const info = parseComfyWorkflowNodes(text)
      if (!info.valid) {
        toast.error(info.error || '工作流 JSON 无效')
        return
      }
      const detected = autoDetectComfyMappings(text)
      setComfyCheck(null)
      updateComfyUiParams({
        workflowPreset: 'custom',
        workflowJson: text,
        ...detected,
      })
      setShowAdvanced(true)
      toast.success(
        `已导入工作流：识别到 ${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`
      )
    } catch {
      toast.error('读取 JSON 文件失败')
    }
  }

  const handleExportComfyJson = async (original = false) => {
    try {
      const cp = apiConfig.comfyuiParams
      const schemas = !original && cp.parameterOverrides?.workflowId === workflowIdentity(cp.workflowJson) ? await fetchComfyObjectInfo(providerCfg.baseUrl, providerCfg.apiKey, cp.workflowJson) : undefined
      const wf = JSON.parse(original ? cp.workflowJson : applyWorkflowOverrides(cp.workflowJson, cp.parameterOverrides, schemas))
      if (!original && cp.promptNodeId && cp.promptNodeId !== 'none' && wf[cp.promptNodeId]?.inputs) {
        const inputs = wf[cp.promptNodeId].inputs
        for (const field of ['prompt', 'text', 'string', 'positive']) {
          if (typeof inputs[field] === 'string') {
            inputs[field] = prompt
            break
          }
        }
      }
      const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comfyui-workflow-${Date.now()}.api.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出 ComfyUI API 工作流 JSON')
    } catch {
      toast.error('当前工作流 JSON 格式有误，无法导出')
    }
  }

  const handleSlotUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const slot = uploadSlotRef.current
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingSlot(slot)
    try {
      const url = await fileToDataUrl(file)
      const image = new Image()
      image.src = url
      await image.decode()
      const name = file.name.replace(/\.[^.]+$/, '') || '上传图片'
      const items = uploadedReferences(name, url, image.width, image.height, file.size)
    if (slot === 'portrait') setPortrait(items.portrait)
    if (slot === 'costume') setCostume(items.costume)
    if (slot === 'pose') setPose(items.pose)
    if (slot === 'pet') addExtraImage({ name, url, role: 'pet_reference' })
    if (slot === 'pet_costume') addExtraImage({ name, url, role: 'pet_costume' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
    } finally {
      setUploadingSlot(null)
    }
  }

  const extraImages = recipe.extraImages || []
  const petReference = extraImages.find((image) => image.role === 'pet_reference')
  const petCostume = extraImages.find((image) => image.role === 'pet_costume')
  const attachmentImages = extraImages.filter((image) => image.role !== 'pet_reference' && image.role !== 'pet_costume')

  const autoComfyPreset = activeProvider === 'comfyui'
    ? recipe.portrait && recipe.costume && recipe.pose && petReference && petCostume
      ? 'qwen21_5img'
      : recipe.portrait && recipe.costume && recipe.pose && petReference
        ? 'qwen21_4img'
      : !recipe.portrait && !recipe.costume && recipe.pose && petReference && petCostume
        ? 'qwen21_pet_3img'
        : !recipe.portrait && !recipe.costume && recipe.pose && petReference
          ? 'qwen21_pet_2img'
          : null
    : null

  useEffect(() => {
    const currentPreset = apiConfig.comfyuiParams.workflowPreset
    const autoPresets = ['qwen21_5img', 'qwen21_4img', 'qwen21_pet_3img', 'qwen21_pet_2img']
    if (!autoComfyPreset || !autoPresets.includes(currentPreset) || autoComfyPreset === currentPreset) return
    const tpl = COMFYUI_WORKFLOW_TEMPLATES[autoComfyPreset]
    updateComfyUiParams({
      workflowPreset: autoComfyPreset,
      workflowJson: JSON.stringify(tpl.workflow, null, 2),
      ...tpl.defaults,
    })
    toast.success(`已根据参考图切换为：${tpl.label}`)
  }, [activeProvider, apiConfig.comfyuiParams.workflowPreset, autoComfyPreset, updateComfyUiParams])

  const missingReferences = activeProvider === 'comfyui' ? [
    { label: '人像', node: apiConfig.comfyuiParams.portraitNodeId, image: recipe.portrait },
    { label: '服装', node: apiConfig.comfyuiParams.costumeNodeId, image: recipe.costume },
    { label: '姿势', node: apiConfig.comfyuiParams.poseNodeId, image: recipe.pose },
    { label: '宠物', node: apiConfig.comfyuiParams.petNodeId, image: petReference },
    { label: '宠物服装', node: apiConfig.comfyuiParams.petCostumeNodeId, image: petCostume },
  ].filter((slot) => slot.node && slot.node !== 'none' && parsedComfyNodes.imageNodes.some((node) => node.id === slot.node && node.emptyValue === undefined) && !slot.image).map((slot) => slot.label) : []

  const hasStitchRefs = Boolean(recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0)
  const hasAnyRef = hasStitchRefs || activeWorkflowImages.length > 0

  const handleRandom = async () => {
    const [posesRes, costumes, portraits, pets] = await Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
      qc.ensureQueryData(petsQuery),
    ])
    randomizeRecipe({
      poses: posesRes.items,
      costumes,
      portraits,
      pets,
    })
  }

  const handleRandomSlot = async (slot: ReferenceSlot) => {
    const expectedId = recipe[slot]?.id ?? null
    setRandomizingSlot(slot)
    try {
      const pools = slot === 'portrait' ? { portraits: await qc.ensureQueryData(portraitsQuery) }
        : slot === 'costume' ? { costumes: await qc.ensureQueryData(costumesQuery) }
        : { poses: recipe.portrait && petReference ? interactionPoseItems(await qc.ensureQueryData(petsQuery)) : (await qc.ensureQueryData(posesQuery)).items }
      randomizeSlot(slot, randomScopes[slot], pools, expectedId)
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    } finally {
      setRandomizingSlot(null)
    }
  }

  const handleRandomPetSlot = async (slot: 'pet_reference' | 'pet_costume') => {
    const current = slot === 'pet_reference' ? petReference : petCostume
    setRandomizingPetSlot(slot)
    try {
      const images = await qc.ensureQueryData(petsQuery)
      const currentImage = current && images.find((image) => image.original === current.url || image.views?.some((view) => view.original === current.url))
      const selectedPet = petReference && images.find((image) => image.original === petReference.url || image.views?.some((view) => view.original === petReference.url))
      const selectedPetTag = selectedPet?.category === 'cat' ? '猫猫' : selectedPet?.category === 'dog' ? '狗狗' : null
      const candidates = images.filter((image) => {
        if (slot === 'pet_costume' && image.category !== 'pet_costume') return false
        if (slot === 'pet_reference' && (image.kind !== 'breed' || (image.category !== 'cat' && image.category !== 'dog'))) return false
        if (slot === 'pet_costume' && selectedPetTag && !image.tags.includes(selectedPetTag)) return false
        if (currentImage && image.id === currentImage.id) return false
        if (petRandomScopes[slot] === 'all' || !currentImage) return true
        return slot === 'pet_reference'
          ? image.category === currentImage.category
          : (!selectedPetTag || image.tags.includes(selectedPetTag)) && image.type === currentImage.type
      })
      if (!candidates.length) {
        toast.info(petRandomScopes[slot] === 'similar' ? '没有其他同类素材，可切到“全部”再试' : '没有其他可用素材')
        return
      }
      const picked = pickRandom(candidates)
      const view = picked.views?.[0]
      const next = { name: picked.title, url: view?.original || picked.original, role: slot as 'pet_reference' | 'pet_costume' }
      if (current) replaceExtraImage(current.id, next)
      else addExtraImage(next)
      if (slot === 'pet_reference' && petCostume) {
        const pickedPetTag = picked.category === 'cat' ? '猫猫' : '狗狗'
        const matchingCostumes = images.filter((image) => image.category === 'pet_costume' && image.tags.includes(pickedPetTag) && image.original !== petCostume.url)
        if (matchingCostumes.length) {
          const costume = pickRandom(matchingCostumes)
          const costumeView = costume.views?.[0]
          replaceExtraImage(petCostume.id, { name: costume.title, url: costumeView?.original || costume.original, role: 'pet_costume' })
        }
      }
      toast.success(`已更换${slot === 'pet_reference' ? '宠物' : '宠物服装'}`)
    } catch {
      toast.error('宠物图库加载失败，请稍后重试')
    } finally {
      setRandomizingPetSlot(null)
    }
  }

  const randomControls = (slot: ReferenceSlot, label: string) => <div className="flex basis-full flex-wrap items-center gap-2 border-t pt-2">
    <Select value={randomScopes[slot]} onValueChange={(value) => setRandomScopes((current) => ({ ...current, [slot]: value as RandomScope }))}>
      <SelectTrigger aria-label={`${label}换样范围`} className="min-h-11 w-24"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="similar">同类</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent>
    </Select>
    <Button type="button" variant="outline" className="min-h-11" disabled={uploadingSlot !== null || randomizingSlot !== null} onClick={() => void handleRandomSlot(slot)} aria-label={`${label}换一个`}>
      {randomizingSlot === slot ? <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" /> : <DicesIcon className="size-4" />}换一个
    </Button>
  </div>

  const petRandomControls = (slot: 'pet_reference' | 'pet_costume', label: string) => <div className="flex basis-full flex-wrap items-center gap-2 border-t pt-2">
    <Select value={petRandomScopes[slot]} onValueChange={(value) => setPetRandomScopes((current) => ({ ...current, [slot]: value as RandomScope }))}>
      <SelectTrigger aria-label={`${label}换样范围`} className="min-h-11 w-24"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="similar">同类</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent>
    </Select>
    <Button type="button" variant="outline" className="min-h-11" disabled={uploadingSlot !== null || randomizingSlot !== null || randomizingPetSlot !== null} onClick={() => void handleRandomPetSlot(slot)} aria-label={`${label}换一个`}>
      {randomizingPetSlot === slot ? <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" /> : <DicesIcon className="size-4" />}换一个
    </Button>
  </div>

  const handleOpenStitchModal = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setStitchModalUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const handleGenerate = () => {
    if (activeProvider === 'comfyui') {
      const cp = apiConfig.comfyuiParams
      const workflowImages = recipe.workflowImagesIdentity === workflowIdentity(cp.workflowJson) ? recipe.workflowImages || {} : {}
      const selected = [recipe.portrait ? cp.portraitNodeId : '', recipe.costume ? cp.costumeNodeId : '', recipe.pose ? cp.poseNodeId : '', petReference ? cp.petNodeId : '', petCostume ? cp.petCostumeNodeId : '', ...Object.keys(workflowImages)].filter((id) => id && id !== 'none')
      const combinationError = validateReferenceCombinations(cp.workflowJson, selected)
      if (combinationError) { toast.error(combinationError); setShowAdvanced(true); return }
    }
    if (missingReferences.length) {
      setShowReferenceErrors(true)
      requestAnimationFrame(() => referenceErrorsRef.current?.focus())
      return
    }
    void startGeneration(prompt)
  }

  return (
    <>
      <PageHeader
        title="AI 角色合成台"
        actions={
          activeProvider === 'comfyui' ? <ComfyConnectionStatus compact /> : <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <KeyRoundIcon className="size-4" />
              {providerCfg.apiKey.trim() ? `${providerMeta.shortName} 已配置` : '配置 API Key'}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        {/* 左栏：参考图、模型参数与 Prompt */}
        <div
          className="flex min-w-0 flex-col gap-4 lg:col-span-7"
        >
          {/* 1. 参考图组合 */}
          <Section
            title="1. 参考图组合"
            className="@lg/section:grid-cols-1"
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[11px]">已选 {([recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length + extraImages.length)}/5</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={handleRandom}
                >
                  <DicesIcon className="size-3.5" />
                  随机
                </Button>
                {hasAnyRef && hasStitchRefs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={handleOpenStitchModal}
                  >
                    <LayoutGridIcon className="size-3.5" />
                    参考拼图
                  </Button>
                )}
              </div>
            }
          >

            <input ref={slotInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotUpload} />
            {showReferenceErrors && missingReferences.length > 0 && (
              <div id="reference-errors" ref={referenceErrorsRef} role="alert" tabIndex={-1} className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive focus-visible:outline-2">
                请先选择或上传：{missingReferences.join('、')}。这些槽位已绑定工作流节点。
              </div>
            )}
            {/* 3 个核心图库槽位：手机端单列舒展展示，平板/桌面端三列并排 */}
            <div className="grid min-w-0 grid-cols-1 gap-2 @min-[42rem]/section:grid-cols-3">
              {/* 人像槽 */}
              <div className="relative flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl bg-background p-2.5">
                {recipe.portrait ? (
                  <>
                    <button type="button" aria-label="放大人像参考图" className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
                      const item = recipe.portrait
                      if (item) setZoomImageUrl(referenceImageUrl(item.原图 || item.缩略图))
                    }}>
                      <img
                        src={referenceImageUrl(recipe.portrait.缩略图)}
                        alt={recipe.portrait.标题}
                        className="h-12 w-10 shrink-0 rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="shrink-0 text-[11px] text-muted-foreground">人像</span>
                        <button
                          type="button"
                          aria-label="清除人像参考图"
                          onClick={() => setPortrait(null)}
                          className="-mr-0.5 -mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <div className="line-clamp-2 text-xs font-medium leading-snug" title={recipe.portrait.发型名称}>
                        {recipe.portrait.发型名称}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/portraits"
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <UserRoundIcon className="size-4" />
                      </div>
                      <span className="truncate text-xs">+ 选人像</span>
                    </Link>
                    <Button type="button" variant="ghost" size="sm" aria-label="上传人像参考图" aria-describedby={showReferenceErrors && missingReferences.includes('人像') ? 'reference-errors' : undefined} aria-busy={uploadingSlot === 'portrait'} disabled={uploadingSlot !== null || randomizingSlot !== null} className="h-12 shrink-0 border-l px-2 text-xs" onClick={() => { uploadSlotRef.current = 'portrait'; slotInputRef.current?.click() }}>
                      {uploadingSlot === 'portrait' ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}
                      {uploadingSlot === 'portrait' ? '处理中' : '上传'}
                    </Button>
                  </>
                )}
                {randomControls('portrait', '人像')}
              </div>

              {/* 宠物槽 */}
              <div className="relative flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl bg-background p-2.5">
                {petReference ? (
                  <>
                    <button type="button" aria-label="放大宠物参考图" className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
                      setZoomImageUrl(petReference.url)
                    }}>
                      <img
                        src={petReference.url}
                        alt={petReference.name}
                        className="h-12 w-10 shrink-0 rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="shrink-0 text-[11px] text-muted-foreground">宠物</span>
                        <button
                          type="button"
                          aria-label="清除宠物参考图"
                          onClick={() => removeExtraImage(petReference.id)}
                          className="-mr-0.5 -mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <div className="line-clamp-2 text-xs font-medium leading-snug" title={petReference.name}>
                        {petReference.name}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/pet-breeds"
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <PawPrintIcon className="size-4" />
                      </div>
                      <span className="truncate text-xs">+ 选宠物</span>
                    </Link>
                    <Button type="button" variant="ghost" size="sm" aria-label="上传宠物参考图" aria-busy={uploadingSlot === 'pet'} disabled={uploadingSlot !== null || randomizingSlot !== null || randomizingPetSlot !== null} className="h-12 shrink-0 border-l px-2 text-xs" onClick={() => { uploadSlotRef.current = 'pet'; slotInputRef.current?.click() }}>
                      {uploadingSlot === 'pet' ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}
                      {uploadingSlot === 'pet' ? '处理中' : '上传'}
                    </Button>
                  </>
                )}
                {petReference && petRandomControls('pet_reference', '宠物')}
              </div>

              {/* 宠物服装槽 */}
              <div className="relative flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl bg-background p-2.5">
                {petCostume ? (
                  <>
                    <button type="button" aria-label="放大宠物服装参考图" className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
                      setZoomImageUrl(petCostume.url)
                    }}>
                      <img
                        src={petCostume.url}
                        alt={petCostume.name}
                        className="h-12 w-10 shrink-0 rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="shrink-0 text-[11px] text-muted-foreground">宠物服装</span>
                        <button
                          type="button"
                          aria-label="清除宠物服装参考图"
                          onClick={() => removeExtraImage(petCostume.id)}
                          className="-mr-0.5 -mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <div className="line-clamp-2 text-xs font-medium leading-snug" title={petCostume.name}>
                        {petCostume.name}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/pet-costumes"
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <ShirtIcon className="size-4" />
                      </div>
                      <span className="truncate text-xs">+ 选宠物服装</span>
                    </Link>
                    <Button type="button" variant="ghost" size="sm" aria-label="上传宠物服装参考图" aria-busy={uploadingSlot === 'pet_costume'} disabled={uploadingSlot !== null || randomizingSlot !== null || randomizingPetSlot !== null} className="h-12 shrink-0 border-l px-2 text-xs" onClick={() => { uploadSlotRef.current = 'pet_costume'; slotInputRef.current?.click() }}>
                      {uploadingSlot === 'pet_costume' ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}
                      {uploadingSlot === 'pet_costume' ? '处理中' : '上传'}
                    </Button>
                  </>
                )}
                {petCostume && petRandomControls('pet_costume', '宠物服装')}
              </div>

              {/* 服装槽 */}
              <div className="relative flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl bg-background p-2.5">
                {recipe.costume ? (
                  <>
                    <button type="button" aria-label="放大服装参考图" className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
                      const item = recipe.costume
                      if (item) setZoomImageUrl(referenceImageUrl(item.预览图 || item.原图 || item.缩略图))
                    }}>
                      <img
                        src={referenceImageUrl(recipe.costume.缩略图)}
                        alt={recipe.costume.服装名称}
                        className="h-12 w-10 shrink-0 rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="shrink-0 text-[11px] text-muted-foreground">服装</span>
                        <button
                          type="button"
                          aria-label="清除服装参考图"
                          onClick={() => setCostume(null)}
                          className="-mr-0.5 -mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <div className="line-clamp-2 text-xs font-medium leading-snug" title={recipe.costume.服装名称}>
                        {recipe.costume.服装名称}
                      </div>
                      {costumeViews.length > 0 && <Select
                        value={costumeViews.find((view) => view.id === recipe.costume?.selectedView)?.id || costumeViews.find((view) => view.id === 'front')?.id || costumeViews[0].id}
                        disabled={uploadingSlot !== null || randomizingSlot !== null}
                        onValueChange={(value) => {
                          if (recipe.costume && uploadingSlot === null && randomizingSlot === null) setCostume(selectCostumeView(recipe.costume, value))
                        }}
                      >
                        <SelectTrigger aria-label="已选服装视角" className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{costumeViews.map((view) => <SelectItem key={view.id} value={view.id}>{view.label}</SelectItem>)}</SelectContent>
                      </Select>}
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/costumes"
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <ShirtIcon className="size-4" />
                      </div>
                      <span className="truncate text-xs">+ 选服装</span>
                    </Link>
                    <Button type="button" variant="ghost" size="sm" aria-label="上传服装参考图" aria-describedby={showReferenceErrors && missingReferences.includes('服装') ? 'reference-errors' : undefined} aria-busy={uploadingSlot === 'costume'} disabled={uploadingSlot !== null || randomizingSlot !== null} className="h-12 shrink-0 border-l px-2 text-xs" onClick={() => { uploadSlotRef.current = 'costume'; slotInputRef.current?.click() }}>
                      {uploadingSlot === 'costume' ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}
                      {uploadingSlot === 'costume' ? '处理中' : '上传'}
                    </Button>
                  </>
                )}
                {randomControls('costume', '服装')}
              </div>

              {/* 姿势槽 */}
              <div className="relative flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl bg-background p-2.5">
                {recipe.pose ? (
                  <>
                    <button type="button" aria-label="放大姿势参考图" className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
                      const item = recipe.pose
                      if (item) setZoomImageUrl(referenceImageUrl(poseImagePath(item)))
                    }}>
                      <img
                        src={referenceImageUrl(poseThumbPath(recipe.pose))}
                        alt={recipe.pose.姿势名称}
                        className="h-12 w-10 shrink-0 rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="shrink-0 text-[11px] text-muted-foreground">姿势</span>
                      </div>
                      <div
                        className="line-clamp-2 text-xs font-medium leading-snug"
                        title={recipe.pose.角度 ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}` : recipe.pose.姿势名称}
                      >
                        {recipe.pose.角度 ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}` : recipe.pose.姿势名称}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2">
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <PersonStandingIcon className="size-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        <Link to="/pet-poses" className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">+ 宠物姿势</Link>
                        <Link to="/pet-interactions" className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">+ 人宠互动</Link>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" aria-label="上传姿势参考图" aria-describedby={showReferenceErrors && missingReferences.includes('姿势') ? 'reference-errors' : undefined} aria-busy={uploadingSlot === 'pose'} disabled={uploadingSlot !== null || randomizingSlot !== null} className="h-12 shrink-0 border-l px-2 text-xs" onClick={() => { uploadSlotRef.current = 'pose'; slotInputRef.current?.click() }}>
                      {uploadingSlot === 'pose' ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}
                      {uploadingSlot === 'pose' ? '处理中' : '上传'}
                    </Button>
                  </>
                )}
                {randomControls('pose', '姿势')}
              </div>
            </div>

            {/* 保留已有的附加参考图，并允许移除或修改备注 */}
            <div className="space-y-2 pt-1">
              {attachmentImages.length > 0 && (
                <div className="grid min-w-0 grid-cols-1 gap-2 @min-[42rem]/section:grid-cols-3">
                  {attachmentImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="flex items-start gap-2 rounded-xl border border-border/60 bg-background p-1.5"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-11 w-9 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-muted-foreground">附加参考图 #{idx + 1}</div>
                        <input
                          type="text"
                          value={img.name}
                          onChange={(e) => updateExtraImageName(img.id, e.target.value)}
                          placeholder="备注(如:配饰/背景)"
                          className="w-full truncate bg-transparent text-xs font-medium outline-none focus:underline"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExtraImage(img.id)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </Section>

          {/* 2. 协议、模型与可折叠高级参数 */}
          <Section
            title="2. 模型与参数"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
                <SlidersHorizontalIcon className="size-3.5" />
                高级参数
                {showAdvanced ? (
                  <ChevronUpIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
              </Button>
            }
          >
            <Field label="接口协议">
              <Select
                value={activeProvider}
                onValueChange={(v) => updateApiConfig({ activeProvider: v as ImageProviderId })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_LIST.map((pid) => (
                    <SelectItem key={pid} value={pid}>
                      {PROVIDER_META[pid].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {activeProvider === 'comfyui' ? (
              <Field label="工作流模板 (API 格式)">
                <div className="space-y-2">
                  <Select
                    value={apiConfig.comfyuiParams.workflowPreset}
                    onValueChange={(v) =>
                      handleSelectComfyPreset(v as ComfyUiParams['workflowPreset'])
                    }
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(COMFYUI_WORKFLOW_TEMPLATES) as ComfyPresetId[]).map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {COMFYUI_WORKFLOW_TEMPLATES[key].label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs">
                        自定义工作流 (已导入 JSON)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1.5">
                    <input
                      ref={comfyFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleComfyFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => comfyFileInputRef.current?.click()}
                    >
                      <FileUpIcon className="size-3.5" />
                      导入 .json
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowComfyJsonModal(true)}
                    >
                      <CodeXmlIcon className="size-3.5" />
                      编辑 JSON
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleExportComfyJson()}
                    >
                      <DownloadIcon className="size-3.5" />
                      导出 .json
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleCheckComfy}
                      disabled={checkingComfy}
                    >
                      {checkingComfy ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                      ) : (
                        <ScanSearchIcon className="size-3.5" />
                      )}
                      检测本机模型
                    </Button>
                  </div>
                  {comfyCheck && (
                    <div
                      className={`space-y-1 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                        comfyCheck.ok
                          ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
                          : 'border-destructive/40 bg-destructive/10 text-destructive'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        {comfyCheck.ok ? (
                          <CircleCheckIcon className="size-3.5" />
                        ) : (
                          <CircleAlertIcon className="size-3.5" />
                        )}
                        {comfyCheck.ok ? '工作流与本机模型/节点匹配，可以生成' : '检测未通过'}
                      </div>
                      {comfyCheck.info && <div className="opacity-80">{comfyCheck.info}</div>}
                      {comfyCheck.errors.map((m, i) => (
                        <div key={`e${i}`} className="whitespace-pre-wrap break-all">
                          • {m}
                        </div>
                      ))}
                      {comfyCheck.fixes.map((m, i) => (
                        <div key={`f${i}`} className="break-all">
                          ✓ {m}
                        </div>
                      ))}
                      {comfyCheck.warnings.map((m, i) => (
                        <div key={`w${i}`} className="break-all opacity-80">
                          ! {m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            ) : (
              <>
                <Field label="模型 ID">
                  <Select
                    value={providerCfg.model}
                    onValueChange={(v) => updateProviderConfig(activeProvider, { model: v })}
                  >
                    <SelectTrigger className="w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerMeta.models.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {providerCfg.model === 'custom' && (
                  <Field label="自定义模型 ID">
                    <Input
                      value={providerCfg.customModel}
                      onChange={(e) =>
                        updateProviderConfig(activeProvider, { customModel: e.target.value })
                      }
                      placeholder="输入模型 ID"
                      className="bg-background font-mono text-xs"
                    />
                  </Field>
                )}
              </>
            )}

            <Field label="画风预设">
              <Select
                value={apiConfig.stylePreset}
                onValueChange={(v) => updateApiConfig({ stylePreset: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STYLE_PRESETS).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {activeProvider === 'comfyui' && (
              <>
                {!parsedComfyNodes.valid && (
                  <div className="col-span-full rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {parsedComfyNodes.error}
                  </div>
                )}

                <Field label="人像图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.portraitNodeId}
                    onValueChange={(v) => updateComfyUiParams({ portraitNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="服装图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.costumeNodeId}
                    onValueChange={(v) => updateComfyUiParams({ costumeNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="姿势图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.poseNodeId}
                    onValueChange={(v) => updateComfyUiParams({ poseNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="宠物图节点 (LoadImage)">
                  <Select value={apiConfig.comfyuiParams.petNodeId} onValueChange={(v) => updateComfyUiParams({ petNodeId: v })}>
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">不绑定</SelectItem>{parsedComfyNodes.imageNodes.map((n) => <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>

                <Field label="宠物服装图节点 (LoadImage)">
                  <Select value={apiConfig.comfyuiParams.petCostumeNodeId} onValueChange={(v) => updateComfyUiParams({ petCostumeNodeId: v })}>
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">不绑定</SelectItem>{parsedComfyNodes.imageNodes.map((n) => <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>

                <Field label="正向提示词节点 (Prompt)">
                  <Select
                    value={apiConfig.comfyuiParams.promptNodeId}
                    onValueChange={(v) => updateComfyUiParams({ promptNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">保留工作流原提示词</SelectItem>
                      {parsedComfyNodes.promptNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title} ({n.field})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {activeProvider === 'comfyui' && showAdvanced && <WorkflowParameters onPreview={setZoomImageUrl} onUploadingChange={setUploadingSlot} />}

            {/* 展开的高级协议专属参数 */}
            {showAdvanced && (
              <>
                {activeProvider === 'gemini' && (
                  <>
                    <Field label="Gemini 协议模式">
                      <Select
                        value={apiConfig.geminiParams.endpointMode}
                        onValueChange={(v) =>
                          updateGeminiParams({ endpointMode: v as GeminiParams['endpointMode'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="native">Native (:generateContent)</SelectItem>
                          <SelectItem value="openai_chat">OpenAI Chat (/v1/chat/completions)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="宽高比 (aspectRatio)">
                      <Select
                        value={apiConfig.geminiParams.aspectRatio}
                        onValueChange={(v) =>
                          updateGeminiParams({ aspectRatio: v as GeminiParams['aspectRatio'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3:4">3:4</SelectItem>
                          <SelectItem value="9:16">9:16</SelectItem>
                          <SelectItem value="1:1">1:1</SelectItem>
                          <SelectItem value="4:3">4:3</SelectItem>
                          <SelectItem value="16:9">16:9</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="分辨率 (imageSize)">
                      <Select
                        value={apiConfig.geminiParams.imageSize}
                        onValueChange={(v) =>
                          updateGeminiParams({ imageSize: v as GeminiParams['imageSize'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1K">1K</SelectItem>
                          <SelectItem value="2K">2K</SelectItem>
                          <SelectItem value="4K">4K</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'gpt' && (
                  <>
                    <Field label="调用端点 (endpointMode)">
                      <Select
                        value={apiConfig.gptParams.endpointMode}
                        onValueChange={(v) =>
                          updateGptParams({ endpointMode: v as GptParams['endpointMode'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="images_edits_json">/v1/images/edits (JSON)</SelectItem>
                          <SelectItem value="responses">/v1/responses</SelectItem>
                          <SelectItem value="chat">/v1/chat/completions</SelectItem>
                          <SelectItem value="images_edits">/v1/images/edits (Multipart)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.gptParams.size}
                        onValueChange={(v) => updateGptParams({ size: v as GptParams['size'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1024x1536">1024x1536</SelectItem>
                          <SelectItem value="1024x1024">1024x1024</SelectItem>
                          <SelectItem value="1536x1024">1536x1024</SelectItem>
                          <SelectItem value="auto">auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="渲染质量 (quality)">
                      <Select
                        value={apiConfig.gptParams.quality}
                        onValueChange={(v) => updateGptParams({ quality: v as GptParams['quality'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="xhigh">xhigh</SelectItem>
                          <SelectItem value="max">max</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                          <SelectItem value="auto">auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="参考还原度 (input_fidelity)">
                      <Select
                        value={apiConfig.gptParams.inputFidelity}
                        onValueChange={(v) =>
                          updateGptParams({ inputFidelity: v as GptParams['inputFidelity'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="背景模式 (background)">
                      <Select
                        value={apiConfig.gptParams.background}
                        onValueChange={(v) =>
                          updateGptParams({ background: v as GptParams['background'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">auto</SelectItem>
                          <SelectItem value="transparent">transparent</SelectItem>
                          <SelectItem value="opaque">opaque</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="图片格式 (output_format)">
                      <Select
                        value={apiConfig.gptParams.outputFormat}
                        onValueChange={(v) =>
                          updateGptParams({ outputFormat: v as GptParams['outputFormat'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="png">png</SelectItem>
                          <SelectItem value="webp">webp</SelectItem>
                          <SelectItem value="jpeg">jpeg</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'qwen' && (
                  <>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.qwenParams.size}
                        onValueChange={(v) => updateQwenParams({ size: v as QwenParams['size'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1024*1536">1024*1536</SelectItem>
                          <SelectItem value="928*1664">928*1664</SelectItem>
                          <SelectItem value="1328*1328">1328*1328</SelectItem>
                          <SelectItem value="1664*928">1664*928</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="提示词扩写 (prompt_extend)">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.qwenParams.promptExtend ? '开启' : '关闭'}
                        </span>
                        <Switch
                          checked={apiConfig.qwenParams.promptExtend}
                          onCheckedChange={(v) => updateQwenParams({ promptExtend: v })}
                        />
                      </div>
                    </Field>
                    <Field label="反向提示词 (negative_prompt)">
                      <Input
                        value={apiConfig.qwenParams.negativePrompt}
                        onChange={(e) => updateQwenParams({ negativePrompt: e.target.value })}
                        placeholder="低分辨率，多余手指，扭曲"
                        className="bg-background text-xs"
                      />
                    </Field>
                  </>
                )}

                {activeProvider === 'doubao' && (
                  <>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.doubaoParams.size}
                        onValueChange={(v) =>
                          updateDoubaoParams({ size: v as DoubaoParams['size'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1728x2304">1728x2304</SelectItem>
                          <SelectItem value="2K">2K</SelectItem>
                          <SelectItem value="4K">4K</SelectItem>
                          <SelectItem value="1440x2560">1440x2560</SelectItem>
                          <SelectItem value="2048x2048">2048x2048</SelectItem>
                          <SelectItem value="2560x1440">2560x1440</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="组图模式 (sequential)">
                      <Select
                        value={apiConfig.doubaoParams.sequentialImageGeneration}
                        onValueChange={(v) =>
                          updateDoubaoParams({
                            sequentialImageGeneration:
                              v as DoubaoParams['sequentialImageGeneration'],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">disabled (单张)</SelectItem>
                          <SelectItem value="auto">auto (组图)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="返回格式 (response_format)">
                      <Select
                        value={apiConfig.doubaoParams.responseFormat}
                        onValueChange={(v) =>
                          updateDoubaoParams({
                            responseFormat: v as DoubaoParams['responseFormat'],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="b64_json">b64_json</SelectItem>
                          <SelectItem value="url">url</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'comfyui' && (
                  <>
                    <Field label="三合一拼图节点 (可选)">
                      <Select
                        value={apiConfig.comfyuiParams.stitchedNodeId}
                        onValueChange={(v) => updateComfyUiParams({ stitchedNodeId: v })}
                      >
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不绑定</SelectItem>
                          {parsedComfyNodes.imageNodes.map((n) => (
                            <SelectItem key={n.id} value={n.id} className="text-xs">
                              #{n.id} {n.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="最长等待时间（秒）">
                      <Input
                        type="number"
                        min={60}
                        step={60}
                        value={apiConfig.comfyuiParams.timeoutSec}
                        onChange={(e) =>
                          updateComfyUiParams({ timeoutSec: Math.max(60, Number(e.target.value) || 600) })
                        }
                        className="bg-background text-xs"
                      />
                    </Field>
                    <Field label="随机种子 (seed)">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.comfyuiParams.randomizeSeed ? '每次随机种子' : '固定工作流种子'}
                        </span>
                        <Switch
                          checked={apiConfig.comfyuiParams.randomizeSeed}
                          onCheckedChange={(v) => updateComfyUiParams({ randomizeSeed: v })}
                        />
                      </div>
                    </Field>
                  </>
                )}

                {activeProvider !== 'comfyui' && (
                  <>
                    <Field label="图片传参方式">
                      <Select
                        value={apiConfig.imagePassMode}
                        onValueChange={(v) => updateApiConfig({ imagePassMode: v as ImagePassMode })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">自动（本地转 Base64）</SelectItem>
                          <SelectItem value="base64">Base64</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="附带合成拼图">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.sendStitchedSheet ? '同时发送拼图' : '仅发单图序列'}
                        </span>
                        <Switch
                          checked={apiConfig.sendStitchedSheet}
                          onCheckedChange={(v) => updateApiConfig({ sendStitchedSheet: v })}
                        />
                      </div>
                    </Field>
                  </>
                )}
              </>
            )}
          </Section>

          {/* 3. 提示词与生成按钮 */}
          <Section
            title="3. 提示词 (Prompt)"
            className="@lg/section:grid-cols-1"
            actions={
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setCustomPrompt(null)}>
                  <RotateCcwIcon className="size-3.5" />
                  重置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(prompt)
                    toast.success('已复制')
                  }}
                >
                  <CopyIcon className="size-3.5" />
                  复制
                </Button>
              </div>
            }
          >
            <Textarea
              value={prompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={5}
              className="bg-background font-mono text-xs leading-relaxed"
            />

            <Button
              onClick={handleGenerate}
              disabled={!hydrated || !!activeTask || isGenerating || uploadingSlot !== null}
              className="h-11 w-full text-sm font-semibold"
            >
              {isGenerating ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <SparklesIcon className="size-4" />
                  生成角色图
                </>
              )}
            </Button>
          </Section>
        </div>

        {/* 右栏：专注展示 AI 生成结果与生成状态 */}
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <Section
            title="生成结果"
            className="@lg/section:grid-cols-1"
            actions={
              previewUrl && !isGenerating ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={previewUrl} download="image.png">
                    <DownloadIcon className="size-3.5" />
                    下载图片
                  </a>
                </Button>
              ) : null
            }
          >
            {previewResult && !isGenerating && <Button className="min-h-11" variant="outline" onClick={() => setComparisonResult(previewResult)}>对比参考</Button>}
            <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl bg-background p-4 sm:min-h-[460px]">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LoaderCircleIcon className="size-6 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">正在生成角色图…</div>
                    {generatingModel && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {generatingModel}
                      </Badge>
                    )}
                    {generationProgress && (
                      <div className="w-56 max-w-full space-y-1.5 pt-1">
                        <div className="text-xs text-foreground/80">{generationProgress.message}</div>
                        {generationProgress.connection && <p className="text-xs text-muted-foreground">连接：{{connecting: 'WebSocket 连接中', connected: 'WebSocket 已连接', reconnecting: 'WebSocket 重连中，HTTP 保底跟踪', degraded: 'WebSocket 暂不可用，HTTP 保底跟踪'}[generationProgress.connection]}</p>}
                        {generationProgress.percent !== undefined && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${generationProgress.percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <p className="pt-1 text-xs text-muted-foreground">
                      切换页面不会中断当前任务
                    </p>
                  </div>
                </div>
              ) : generationError ? (
                <div className="flex max-w-md flex-col items-center gap-2 text-center">
                  <CircleAlertIcon className="size-7 text-destructive" />
                  <div className="text-sm font-semibold text-destructive">生成失败</div>
                  <p className="whitespace-pre-wrap break-all text-left text-xs leading-relaxed text-muted-foreground">
                    {generationError}
                  </p>
                  {previewUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setZoomImageUrl(previewUrl)}>
                      查看上一张结果
                    </Button>
                  )}
                </div>
              ) : previewUrl ? (
                <button type="button" aria-label="放大生成结果" onClick={() => setZoomImageUrl(previewUrl)} className="cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-ring"><img src={previewUrl} alt="生成结果" className="max-h-[480px] w-auto rounded-xl object-contain transition hover:opacity-95" /></button>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                  <SparklesIcon className="size-7 opacity-35" />
                  <span className="text-xs">点击「生成角色图」后在此处展示生成结果</span>
                </div>
              )}
            </div>
          </Section>
          {activeTask && <Section title="待确认任务" className="@lg/section:grid-cols-1">
            <p className="break-all text-xs">{activeTask.task ? `任务 ${activeTask.task.promptId}：刷新后查询原任务，不重复提交。` : '提交结果未知或提交前被中断，请核对后端队列；不会自动重试提交。'}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isGenerating || !activeTask.task} onClick={() => void resumeGeneration()}>恢复跟踪</Button>
              <Button variant="outline" onClick={() => void stopTracking()}>停止跟踪（不取消后端）</Button>
            </div>
          </Section>}
        </div>
      </div>

      {/* 生成历史记录 */}
      {history.length > 0 && (
        <Section
          title={`生成记录 (${history.length})`}
          className="grid-cols-2 @lg/section:grid-cols-3 @3xl/section:grid-cols-4"
          actions={
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2Icon className="size-3.5" />
              清空
            </Button>
          }
        >
          {history.map((h) => (
            <div
              key={h.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl bg-background p-2"
            >
              <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-muted">
                <button type="button" aria-label={`查看生成记录：${h.recipeSummary}`} onClick={() => setZoomImageUrl(h.imageUrl)} className="block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring">
                <img
                  src={h.imageUrl}
                  alt={h.recipeSummary}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {h.model}
                </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeHistoryItem(h.id)
                  }}
                  title="删除此记录"
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/65 p-1 text-white opacity-85 transition hover:bg-destructive hover:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </div>

              <div className="mt-2 space-y-1.5 px-0.5">
                <div className="truncate text-xs font-medium">{h.recipeSummary}</div>
                <Button variant="outline" className="min-h-11 w-full" onClick={() => setComparisonResult(h)}>对比参考</Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPrompt(h.prompt)
                      toast.success('已恢复该图提示词')
                    }}
                    className="flex h-7 items-center justify-center rounded-lg bg-muted text-[11px] font-medium whitespace-nowrap text-foreground transition hover:bg-muted/70"
                  >
                    复用词
                  </button>
                  <a
                    href={h.imageUrl}
                    download={`character-${h.id}.png`}
                    className="flex h-7 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-medium whitespace-nowrap text-primary transition hover:bg-primary/20"
                  >
                    下载
                  </a>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      <ReferenceComparisonDialog result={comparisonResult} open={comparisonResult !== null} onOpenChange={(open) => !open && setComparisonResult(null)} />
      {/* 生成结果全屏放大灯箱 */}
      <ImageViewer imageUrl={zoomImageUrl || ''} open={Boolean(zoomImageUrl)} onOpenChange={(open) => !open && setZoomImageUrl(null)} />

      {/* 参考拼图独立弹窗（不占用主画布） */}
      <Dialog open={Boolean(stitchModalUrl)} onOpenChange={(o) => !o && setStitchModalUrl(null)}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">参考图拼合卡片</DialogTitle>
            {stitchModalUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={stitchModalUrl} download="reference-sheet.jpg">
                  <DownloadIcon className="size-3.5" />
                  下载拼图
                </a>
              </Button>
            )}
          </DialogHeader>
          {stitchModalUrl && (
            <div className="mt-2 flex items-center justify-center overflow-hidden rounded-xl bg-muted p-2">
              <img
                src={stitchModalUrl}
                alt="参考拼图"
                className="max-h-[70dvh] w-auto rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ComfyUI API 工作流 JSON 编辑器弹窗 */}
      <Dialog open={showComfyJsonModal} onOpenChange={setShowComfyJsonModal}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">ComfyUI API 工作流 JSON</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const info = parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson)
                if (!info.valid) {
                  toast.error(info.error || '工作流 JSON 无效')
                  return
                }
                const detected = autoDetectComfyMappings(apiConfig.comfyuiParams.workflowJson)
                updateComfyUiParams(detected)
                toast.success(
                  `已自动重新识别节点：${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`
                )
              }}
            >
              自动识别节点
            </Button>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            请在 ComfyUI 设置中开启「启用开发模式选项」，点击菜单中的「导出 (API)」获取 JSON 并粘贴于下方。
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void handleExportComfyJson(true)}>导出原始 API</Button>
          <Textarea
            value={apiConfig.comfyuiParams.workflowJson}
            onChange={(e) =>
              updateComfyUiParams({
                workflowPreset: 'custom',
                workflowJson: e.target.value,
              })
            }
            rows={18}
            className="font-mono text-xs leading-relaxed"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
