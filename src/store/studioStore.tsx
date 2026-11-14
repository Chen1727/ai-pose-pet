import { createContext, type ReactNode, useContext, useEffect, useEffectEvent, useRef, useState } from 'react'
import { toast } from '@/lib/notifications'
import { useComfyConnection, type ComfyConnectionState } from './useComfyConnection'
import { idbRead, idbWrite } from '@/lib/idbStorage'
import { parseParameterWorkflow, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { durableImage, snapshotGeneration } from '@/lib/generationSnapshot'
import { recipeBackup } from '@/lib/recipeImages'
import { getReferenceGender, isLocalUpload, randomSlot, type RandomScope, type ReferencePools, type ReferenceSlot } from '@/lib/randomRecipe'
import {
  buildRecipePrompt,
  COMFYUI_WORKFLOW_TEMPLATES,
  DEFAULT_COMFY_PRESET,
  generateCharacterImage,
  resumeComfyTask,
  ComfyTaskError,
  ComfySubmissionRejectedError,
  type ComfyTaskHandle,
  type GenerationProgress,
  PROVIDER_META,
  stitchRecipeCanvas,
} from '@/services/aiGenerator'
import type {
  ApiConfig,
  ComfyUiParams,
  CostumeItem,
  DoubaoParams,
  ExtraReferenceImage,
  GeminiParams,
  GenerationHistoryItem,
  GenerationSnapshot,
  GptParams,
  ImageProviderId,
  PortraitItem,
  PoseItem,
  ProviderEndpointConfig,
  QwenParams,
  RecipeState,
} from '@/types/gallery'
import type { PetImage } from '@/types/pet'

const CFG_KEY = 'pose_atlas_api_config_v3'
// Catalog cleanup invalidates the old selection cache so removed references do not reappear.
const RECIPE_KEY = 'paw_archive_recipe_v4'
const HISTORY_KEY = 'pose_atlas_history_v3'
const TASK_KEY = 'pose_atlas_active_task_v1'
type ActiveTask = { task?: ComfyTaskHandle; prompt: string; summary: string; unknown?: boolean; snapshot?: GenerationSnapshot }

const COMFY_CONFIG_VERSION = 4

const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

function interactionPoseItems(images: PetImage[]): PoseItem[] {
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

const shouldEnableProxyByDefault = (provider?: ImageProviderId) =>
  provider === 'qwen' || provider === 'doubao'

const DEFAULT_API_CONFIG: ApiConfig = {
  activeProvider: 'gemini',
  imagePassMode: 'url',
  useProxy: false,
  stylePreset: 'realistic',
  sendStitchedSheet: false,
  providers: {
    gemini: {
      baseUrl: PROVIDER_META.gemini.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gemini.models[0].value,
      customModel: '',
    },
    gpt: {
      baseUrl: PROVIDER_META.gpt.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gpt.models[0].value,
      customModel: '',
    },
    qwen: {
      baseUrl: PROVIDER_META.qwen.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.qwen.models[0].value,
      customModel: '',
    },
    doubao: {
      baseUrl: PROVIDER_META.doubao.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.doubao.models[0].value,
      customModel: '',
    },
    comfyui: {
      baseUrl: PROVIDER_META.comfyui.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.comfyui.models[0].value,
      customModel: '',
    },
  },
  gptParams: {
    endpointMode: 'images_edits_json',
    size: '1024x1536',
    quality: 'high',
    inputFidelity: 'high',
    background: 'auto',
    outputFormat: 'png',
    moderation: 'auto',
  },
  geminiParams: {
    endpointMode: 'native',
    aspectRatio: '3:4',
    imageSize: '2K',
  },
  qwenParams: {
    size: '1024*1536',
    promptExtend: true,
    watermark: false,
    negativePrompt: '',
    n: 1,
  },
  doubaoParams: {
    size: '2K',
    sequentialImageGeneration: 'disabled',
    watermark: false,
    responseFormat: 'b64_json',
  },
  comfyuiParams: {
    workflowPreset: DEFAULT_COMFY_PRESET,
    workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
    ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    randomizeSeed: true,
    timeoutSec: 600,
    configVersion: COMFY_CONFIG_VERSION,
  },
}

// 旧版内置工作流迁移到新的宠物合成默认工作流。
const LEGACY_COMFY_BASE_URLS = ['http://127.0.0.1:8188', 'http://localhost:8188']

function migrateComfy(
  provider: ApiConfig['providers']['comfyui'],
  params: ApiConfig['comfyuiParams']
): { provider: ApiConfig['providers']['comfyui']; params: ApiConfig['comfyuiParams'] } {
  if ((params.configVersion ?? 1) >= COMFY_CONFIG_VERSION) return { provider, params }
  const nextParams = { ...params, configVersion: COMFY_CONFIG_VERSION }
  if (['qwen2509_3img', 'qwen2509_2img', 'qwen21_3img', 'qwen21_2img'].includes(params.workflowPreset)) {
    Object.assign(nextParams, {
      workflowPreset: DEFAULT_COMFY_PRESET,
      workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
      ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    })
  }
  const nextProvider = { ...provider }
  if (!nextProvider.baseUrl.trim() || LEGACY_COMFY_BASE_URLS.includes(nextProvider.baseUrl.trim())) {
    nextProvider.baseUrl = PROVIDER_META.comfyui.defaultBaseUrl
  }
  if (!PROVIDER_META.comfyui.models.some((m) => m.value === nextProvider.model)) {
    nextProvider.model = PROVIDER_META.comfyui.models[0].value
  }
  return { provider: nextProvider, params: nextParams }
}

function mergeStoredConfig(raw: unknown): ApiConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_API_CONFIG
  const obj = raw as Partial<ApiConfig>
  const storedVer = obj.comfyuiParams?.configVersion ?? 1
  const comfy = migrateComfy(
    { ...DEFAULT_API_CONFIG.providers.comfyui, ...obj.providers?.comfyui },
    { ...DEFAULT_API_CONFIG.comfyuiParams, configVersion: 1, ...obj.comfyuiParams }
  )
  const activeProvider = obj.activeProvider ?? DEFAULT_API_CONFIG.activeProvider
  const storedQwen = { ...DEFAULT_API_CONFIG.providers.qwen, ...obj.providers?.qwen }
  const qwenUsesLegacyTranslationModel = /^qwen-mt-/i.test(
    storedQwen.model === 'custom' ? storedQwen.customModel.trim() : storedQwen.model
  )
  const qwenProvider = qwenUsesLegacyTranslationModel
    ? { ...storedQwen, model: 'qwen-image-2.1-pro', customModel: '' }
    : storedQwen
  // v3 起服务端 CORS 代理默认关闭，仅在切换到 Qwen / Doubao 时自动关联开启
  const useProxy =
    storedVer < 3
      ? shouldEnableProxyByDefault(activeProvider)
      : (obj.useProxy ?? shouldEnableProxyByDefault(activeProvider))
  return {
    ...DEFAULT_API_CONFIG,
    ...obj,
    activeProvider,
    useProxy,
    providers: {
      gemini: { ...DEFAULT_API_CONFIG.providers.gemini, ...obj.providers?.gemini },
      gpt: { ...DEFAULT_API_CONFIG.providers.gpt, ...obj.providers?.gpt },
      qwen: qwenProvider,
      doubao: { ...DEFAULT_API_CONFIG.providers.doubao, ...obj.providers?.doubao },
      comfyui: comfy.provider,
    },
    gptParams: { ...DEFAULT_API_CONFIG.gptParams, ...obj.gptParams },
    geminiParams: { ...DEFAULT_API_CONFIG.geminiParams, ...obj.geminiParams },
    qwenParams: { ...DEFAULT_API_CONFIG.qwenParams, ...obj.qwenParams },
    doubaoParams: { ...DEFAULT_API_CONFIG.doubaoParams, ...obj.doubaoParams },
    comfyuiParams: comfy.params,
  }
}

interface StudioContextValue {
  comfyConnection: ComfyConnectionState
  checkComfyConnection: (manual?: boolean) => Promise<void>
  setComfyConnectionVisible: (visible: boolean) => void
  hydrated: boolean
  activeTask: ActiveTask | null
  resumeGeneration: () => Promise<void>
  stopTracking: () => Promise<void>
  recipe: RecipeState
  apiConfig: ApiConfig
  history: GenerationHistoryItem[]
  // 全局持久化的合成台状态（切换页面不丢失、不断开请求）
  customPrompt: string | null
  setCustomPrompt: (val: string | null) => void
  previewUrl: string
  setPreviewUrl: (url: string) => void
  isGenerating: boolean
  generatingModel: string
  generationProgress: GenerationProgress | null
  generationError: string
  startGeneration: (overridePrompt?: string) => Promise<void>
  refreshStitchPreview: () => Promise<void>
  setPortrait: (item: PortraitItem | null) => void
  setCostume: (item: CostumeItem | null) => void
  setPose: (item: PoseItem | null) => void
  togglePortrait: (item: PortraitItem) => void
  toggleCostume: (item: CostumeItem) => void
  togglePose: (item: PoseItem) => void
  addExtraImage: (item: { name: string; url: string; thumbnailUrl?: string; role?: ExtraReferenceImage['role']; sourceId?: string; species?: 'cat' | 'dog' }) => void
  replaceExtraImage: (id: string, item: { name: string; url: string; thumbnailUrl?: string; role?: ExtraReferenceImage['role']; sourceId?: string; species?: 'cat' | 'dog' }) => void
  removeExtraImage: (id: string) => void
  updateExtraImageName: (id: string, name: string) => void
  setWorkflowImage: (nodeId: string, image: ExtraReferenceImage | null, identity: string) => void
  clearRecipe: () => void
  randomizeRecipe: (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[]; pets?: PetImage[] }) => void
  randomizeSlot: (slot: ReferenceSlot, scope: RandomScope, pools: ReferencePools, expectedId?: string | null) => void
  updateApiConfig: (patch: Partial<ApiConfig>) => void
  updateProviderConfig: (provider: ImageProviderId, patch: Partial<ProviderEndpointConfig>) => void
  updateGptParams: (patch: Partial<GptParams>) => void
  updateGeminiParams: (patch: Partial<GeminiParams>) => void
  updateQwenParams: (patch: Partial<QwenParams>) => void
  updateDoubaoParams: (patch: Partial<DoubaoParams>) => void
  updateComfyUiParams: (patch: Partial<ComfyUiParams>) => void
  addHistory: (item: Omit<GenerationHistoryItem, 'id' | 'createdAt'>) => void
  removeHistoryItem: (id: string) => void
  clearHistory: () => void
}

const StudioContext = createContext<StudioContextValue | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const [recipe, setRecipe] = useState<RecipeState>(() => {
    try {
      const raw = localStorage.getItem(RECIPE_KEY)
      if (!raw) return { portrait: null, costume: null, pose: null, extraImages: [] }
      const parsed = JSON.parse(raw)
      return {
        portrait: parsed.portrait ?? null,
        costume: parsed.costume ?? null,
        pose: parsed.pose ? { ...parsed.pose, useDepth: false } : null,
        extraImages: Array.isArray(parsed.extraImages) ? parsed.extraImages.slice(0, 2) : [],
      }
    } catch {
      return { portrait: null, costume: null, pose: null, extraImages: [] }
    }
  })

  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      const raw = localStorage.getItem(CFG_KEY)
      return raw ? mergeStoredConfig(JSON.parse(raw)) : DEFAULT_API_CONFIG
    } catch {
      return DEFAULT_API_CONFIG
    }
  })

  const [history, setHistory] = useState<GenerationHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [comfyConnectionVisible, setComfyConnectionVisible] = useState(false)
  const { comfyConnection, checkComfyConnection } = useComfyConnection(apiConfig.providers.comfyui.baseUrl, apiConfig.providers.comfyui.apiKey, comfyConnectionVisible && apiConfig.activeProvider === 'comfyui')

  const randomContext = useRef({ recipe })
  useEffect(() => { randomContext.current = { recipe } }, [recipe])

  // 提升到根部 Provider 的生成状态，路由切换不会卸载或中断
  const [customPrompt, setCustomPrompt] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      const list = raw ? JSON.parse(raw) : []
      return list[0]?.imageUrl || ''
    } catch {
      return ''
    }
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingModel, setGeneratingModel] = useState('')
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
  const [generationError, setGenerationError] = useState('')
  const isGeneratingRef = useRef(false)
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const activeTaskRef = useRef<ActiveTask | null>(null)
  const trackingRef = useRef<AbortController | null>(null)
  const historyRef = useRef(history)
  const historyWrites = useRef<Promise<void>>(Promise.resolve())
  const [idbHydrated, setIdbHydrated] = useState(false)

  // 从 IndexedDB 异步恢复大容量历史记录与含附图的配方
  useEffect(() => {
    let active = true
    Promise.all([
      idbRead<RecipeState>(RECIPE_KEY),
      idbRead<GenerationHistoryItem[]>(HISTORY_KEY),
      idbRead<ActiveTask | null>(TASK_KEY),
    ]).then(([savedRecipe, savedHistory, savedTask]) => {
      if (!active) return
      if (savedRecipe) {
        setRecipe((current) => ({
          // 兼容旧版本曾经把人像清空的 IndexedDB 记录，优先保留轻量备份中的人像。
          portrait: savedRecipe.portrait ?? current.portrait ?? null,
          costume: savedRecipe.costume ?? null,
          pose: savedRecipe.pose ? { ...savedRecipe.pose, useDepth: false } : null,
          workflowImages: savedRecipe.workflowImages ?? {},
          workflowImagesIdentity: savedRecipe.workflowImagesIdentity,
          extraImages: Array.isArray(savedRecipe.extraImages) ? savedRecipe.extraImages.slice(0, 2) : [],
        }))
      }
      if (Array.isArray(savedHistory)) {
        historyRef.current = savedHistory
        setHistory(savedHistory)
        setPreviewUrl((prev) => prev || savedHistory[0]?.imageUrl || '')
      }
      activeTaskRef.current = savedTask || null
      setActiveTask(savedTask || null)
      setIdbHydrated(true)
    }).catch(() => { if (active) toast.error('无法读取浏览器存储，已暂停生成以保护待确认任务；请恢复存储后刷新') })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!idbHydrated) return
    void idbWrite(RECIPE_KEY, recipe).catch(() => toast.error('配方保存失败，请检查浏览器存储空间'))
    try {
      // 上传图片和附图完整保存在 IndexedDB，轻量备份不包含它们。
      localStorage.setItem(
        RECIPE_KEY,
        JSON.stringify(recipeBackup(recipe))
      )
    } catch {}
  }, [recipe, idbHydrated])

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(apiConfig))
    } catch {}
  }, [apiConfig])


  const setPortrait = (portrait: PortraitItem | null) => setRecipe((r) => ({ ...r, portrait }))
  const setCostume = (costume: CostumeItem | null) => setRecipe((r) => ({ ...r, costume }))
  const setPose = (pose: PoseItem | null) => setRecipe((r) => ({ ...r, pose: pose ? { ...pose, useDepth: false } : null }))

  const togglePortrait = (item: PortraitItem) => {
    const remove = recipe.portrait?.id === item.id
    setRecipe((r) => ({ ...r, portrait: remove ? null : item }))
    toast.success(remove ? '已移除人像' : `已选人像：${item.发型名称}`)
  }
  const toggleCostume = (item: CostumeItem) => {
    const remove = recipe.costume?.id === item.id && (recipe.costume.selectedView || 'front') === (item.selectedView || 'front')
    setRecipe((r) => ({ ...r, costume: remove ? null : item }))
    toast.success(remove ? '已移除服装' : `已选服装：${item.服装名称}`)
  }
  const togglePose = (item: PoseItem) => {
    const remove = recipe.pose?.id === item.id
    setRecipe((r) => ({ ...r, pose: remove ? null : { ...item, useDepth: false } }))
    toast.success(remove ? '已移除姿势' : `已选姿势：${item.姿势名称}（${item.角度}）`)
  }

  const addExtraImage = (item: { name: string; url: string; thumbnailUrl?: string; role?: ExtraReferenceImage['role']; sourceId?: string; species?: 'cat' | 'dog' }) => {
    if ((recipe.extraImages || []).length >= 2) {
      toast.error('附加参考图最多选择 2 张；合成台总参考图最多 5 张')
      return
    }
    if (item.role && (recipe.extraImages || []).some((image) => image.role === item.role)) {
      toast.info(item.role === 'pet_costume' ? '宠物服装已经添加' : '宠物已经添加')
      return
    }
    const newImg: ExtraReferenceImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name || '附加参考',
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      role: item.role,
      sourceId: item.sourceId,
      species: item.species,
    }
    setRecipe((r) => ({
      ...r,
      extraImages: [...(r.extraImages || []), newImg],
    }))
    toast.success(item.role === 'pet_costume' ? '已添加宠物服装' : item.role === 'pet_reference' ? '已添加宠物' : '已添加附加参考图')
  }

  const removeExtraImage = (id: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).filter((x) => x.id !== id),
    }))
  }

  const replaceExtraImage = (id: string, item: { name: string; url: string; thumbnailUrl?: string; role?: ExtraReferenceImage['role']; sourceId?: string; species?: 'cat' | 'dog' }) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).map((image) => image.id === id ? { ...image, name: item.name, url: item.url, thumbnailUrl: item.thumbnailUrl ?? image.thumbnailUrl, role: item.role, sourceId: item.sourceId, species: item.species } : image),
    }))
  }

  const updateExtraImageName = (id: string, name: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).map((x) => (x.id === id ? { ...x, name } : x)),
    }))
  }

  const setWorkflowImage = (nodeId: string, image: ExtraReferenceImage | null, identity: string) => {
    if (identity !== workflowIdentity(apiConfig.comfyuiParams.workflowJson)) return
    setRecipe((r) => {
      const workflowImages = r.workflowImagesIdentity === identity ? { ...r.workflowImages } : {}
      if (image) workflowImages[nodeId] = image
      else delete workflowImages[nodeId]
      return { ...r, workflowImages, workflowImagesIdentity: identity }
    })
  }

  const activeComfyParams = apiConfig.comfyuiParams
  useEffect(() => {
    if (!idbHydrated) return
    const cp = activeComfyParams
    const identity = workflowIdentity(cp.workflowJson)
    const workflow = parseParameterWorkflow(cp.workflowJson)
    const mapped = [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.petNodeId, cp.petCostumeNodeId, cp.stitchedNodeId]
    const ids = new Set(Object.entries(workflow || {}).filter(([id, node]) => !mapped.includes(id) && typeof node.inputs.image === 'string').map(([id]) => id))
    // IndexedDB 恢复与工作流变更同步时清理失效映射。
    // oxlint-disable-next-line react/set-state-in-effect
    setRecipe((r) => {
      const entries = Object.entries(r.workflowImages || {})
      const kept = r.workflowImagesIdentity === identity ? entries.filter(([id]) => ids.has(id)) : []
      if (entries.length === kept.length && r.workflowImagesIdentity === identity) return r
      return { ...r, workflowImages: Object.fromEntries(kept), workflowImagesIdentity: identity }
    })
  }, [activeComfyParams, idbHydrated])

  const clearRecipe = () => {
    setRecipe({ portrait: null, costume: null, pose: null, extraImages: [] })
    toast.success('已清空配方')
  }

  const randomizeRecipe = (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[]; pets?: PetImage[] }) => {
    const costumePool = (pools.costumes || []).filter((c) => !isLocalUpload(c) && c.一级分类 !== '二次元')
    const portraitPool = pools.portraits || []
    const petPool = (pools.pets || []).filter((pet) => pet.kind === 'breed' && (pet.category === 'cat' || pet.category === 'dog'))

    setRecipe((prev) => {
      const linkedGender = getReferenceGender(prev.portrait) || getReferenceGender(prev.costume)
      const portraitCandidates = linkedGender
        ? portraitPool.filter((item) => getReferenceGender(item) === linkedGender)
        : portraitPool
      const portrait = (portraitCandidates.length ? randomItem(portraitCandidates) : portraitPool.length ? randomItem(portraitPool) : prev.portrait)
      const costumeGender = getReferenceGender(portrait) || linkedGender
      const matchingCostumes = costumeGender ? costumePool.filter((item) => getReferenceGender(item) === costumeGender) : costumePool
      const selectedCostumePool = matchingCostumes.length ? matchingCostumes : costumePool
      const pet = petPool.length ? randomItem(petPool) : null
      const petView = pet?.views?.find((view) => view.id === 'front') || pet?.views?.[0]
      const petReference = pet && {
        id: `random-pet-${pet.id}`,
        name: pet.title,
        url: petView?.original || pet.original,
        thumbnailUrl: petView?.thumbnail || pet.thumbnail,
        role: 'pet_reference' as const,
        sourceId: pet.id,
        species: pet.species,
      }
      const petCostumePool = (pools.pets || []).filter((item) => item.category === 'pet_costume' && (!pet || item.tags.includes(pet.category === 'cat' ? '猫猫' : '狗狗')))
      const petCostume = petCostumePool.length ? randomItem(petCostumePool) : null
      const petCostumeView = petCostume?.views?.find((view) => view.id === 'front') || petCostume?.views?.[0]
      const petCostumeReference = petCostume && {
        id: `random-pet-costume-${petCostume.id}`,
        name: petCostume.title,
        url: petCostumeView?.original || petCostume.original,
        thumbnailUrl: petCostumeView?.thumbnail || petCostume.thumbnail,
        role: 'pet_costume' as const,
        sourceId: petCostume.id,
        species: petCostume.species,
      }
      const retainedExtras = (prev.extraImages || []).filter((image) => image.role !== 'pet_reference' && image.role !== 'pet_costume')
      const extraImages = [...retainedExtras.slice(0, Math.max(0, 2 - Number(Boolean(petReference)) - Number(Boolean(petCostumeReference)))), petReference, petCostumeReference].filter(Boolean) as ExtraReferenceImage[]
      const posePool = portrait && petReference && pools.pets ? interactionPoseItems(pools.pets) : (pools.poses || [])
      return {
        ...prev,
        portrait,
        costume: selectedCostumePool.length ? randomItem(selectedCostumePool) : prev.costume,
        pose: posePool.length ? { ...randomItem(posePool), useDepth: false } : prev.pose,
        extraImages,
      }
    })
    toast.success('已随机抽取一套角色配方')
  }

  const randomizeSlot = (slot: ReferenceSlot, scope: RandomScope, pools: ReferencePools, expectedId?: string | null) => {
    const current = randomContext.current
    if (expectedId !== undefined && (current.recipe[slot]?.id ?? null) !== expectedId) {
      toast.info('参考已更改，本次换样已取消')
      return
    }
    const next = randomSlot(current.recipe, slot, scope, {
      ...pools,
      costumes: pools.costumes || [],
      poses: pools.poses || [],
    }, false)
    if (!next) {
      toast.info(scope === 'similar' ? '没有其他同类素材，可切到“全部”再试' : '没有其他可用素材')
      return
    }
    setRecipe((previous) => ({ ...previous, [slot]: next[slot] }))
    toast.success(`已更换${{ portrait: '人像', costume: '服装', pose: '姿势' }[slot]}，其他参考保持不变`)
  }

  const updateApiConfig = (patch: Partial<ApiConfig>) => {
    setApiConfig((prev) => {
      const next = { ...prev, ...patch }
      if (patch.activeProvider && patch.useProxy === undefined) {
        next.useProxy = shouldEnableProxyByDefault(patch.activeProvider)
      }
      return next
    })
  }

  const updateProviderConfig = (provider: ImageProviderId, patch: Partial<ProviderEndpointConfig>) => {
    setApiConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          ...patch,
        },
      },
    }))
  }

  const updateGptParams = (patch: Partial<GptParams>) => {
    setApiConfig((prev) => ({ ...prev, gptParams: { ...prev.gptParams, ...patch } }))
  }

  const updateGeminiParams = (patch: Partial<GeminiParams>) => {
    setApiConfig((prev) => ({ ...prev, geminiParams: { ...prev.geminiParams, ...patch } }))
  }

  const updateQwenParams = (patch: Partial<QwenParams>) => {
    setApiConfig((prev) => ({ ...prev, qwenParams: { ...prev.qwenParams, ...patch } }))
  }

  const updateDoubaoParams = (patch: Partial<DoubaoParams>) => {
    setApiConfig((prev) => ({ ...prev, doubaoParams: { ...prev.doubaoParams, ...patch } }))
  }

  const updateComfyUiParams = (patch: Partial<ComfyUiParams>) => {
    setApiConfig((prev) => ({ ...prev, comfyuiParams: { ...prev.comfyuiParams, ...patch } }))
  }

  const persistHistory = (update: (current: GenerationHistoryItem[]) => GenerationHistoryItem[]) => {
    const write = historyWrites.current.catch(() => {}).then(async () => {
      const next = update(historyRef.current)
      await idbWrite(HISTORY_KEY, next)
      historyRef.current = next
      setHistory(next)
    })
    historyWrites.current = write
    return write
  }
  const addHistory = (item: Omit<GenerationHistoryItem, 'id' | 'createdAt'>) => {
    void persistHistory((current) => [{ ...item, id: crypto.randomUUID(), createdAt: Date.now() }, ...current].slice(0, 30)).catch(() => toast.error('历史记录保存失败'))
  }
  const removeHistoryItem = (id: string) => {
    void persistHistory((current) => current.filter((x) => x.id !== id)).then(() => toast.success('已删除该条记录')).catch(() => toast.error('删除失败'))
  }
  const clearHistory = () => {
    void persistHistory(() => []).then(() => { localStorage.removeItem(HISTORY_KEY); toast.success('已清空记录') }).catch(() => toast.error('清空记录失败'))
  }

  const refreshStitchPreview = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setPreviewUrl(url)
      toast.success('已合成参考拼图')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const saveActive = async (value: ActiveTask | null) => {
    await idbWrite(TASK_KEY, value)
    activeTaskRef.current = value
    setActiveTask(value)
  }
  const completeGeneration = async (result: {imageUrl: string; modelUsed: string; providerUsed: ImageProviderId}, record: ActiveTask, signal: AbortSignal) => {
    signal.throwIfAborted()
    const imageUrl = await durableImage(result.imageUrl)
    signal.throwIfAborted()
    setPreviewUrl(imageUrl)
    const id = record.task ? `comfy:${record.task.baseUrl}:${record.task.promptId}` : crypto.randomUUID()
    await persistHistory((current) => {
      signal.throwIfAborted()
      return [{ id, createdAt: Date.now(), imageUrl, provider: result.providerUsed, model: result.modelUsed, prompt: record.prompt, recipeSummary: record.summary, snapshot: record.snapshot }, ...current.filter((x) => x.id !== id)].slice(0, 30)
    })
    signal.throwIfAborted()
    await saveActive(null)
    toast.success('角色图已完成并保存')
  }
  const resumeGeneration = async () => {
    const record = activeTaskRef.current
    if (!record?.task || isGeneratingRef.current) return
    isGeneratingRef.current = true
    setIsGenerating(true)
    setGenerationError('')
    const controller = new AbortController()
    trackingRef.current = controller
    try {
      const result = await resumeComfyTask({ task: record.task, apiKey: apiConfig.providers.comfyui.apiKey, timeoutSec: apiConfig.comfyuiParams.timeoutSec, onProgress: setGenerationProgress, signal: controller.signal })
      controller.signal.throwIfAborted()
      await completeGeneration(result, record, controller.signal)
    } catch (e) {
      if (e instanceof ComfySubmissionRejectedError || (e instanceof ComfyTaskError && e.reason === 'failed')) { try { await saveActive(null) } catch { toast.error('任务记录清除失败') } }
      if (!controller.signal.aborted) setGenerationError(e instanceof Error ? e.message : '无法确认任务状态，记录已保留')
    }
    finally { isGeneratingRef.current = false; setIsGenerating(false) }
  }
  const stopTracking = async () => {
    trackingRef.current?.abort()
    try { await saveActive(null); setGenerationError('已停止跟踪；后端任务可能仍在执行，请先确认队列再提交新任务') }
    catch { toast.error('停止跟踪记录保存失败') }
  }
  const resumeOnActivation = useEffectEvent(() => { void resumeGeneration() })
  // 刷新、重新激活与恢复联网只查询已有任务，不重新提交。
  useEffect(() => {
    if (!idbHydrated) return
    const resume = () => {
      if (document.visibilityState === 'visible' && activeTaskRef.current?.task && !isGeneratingRef.current) resumeOnActivation()
    }
    resume()
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [idbHydrated, apiConfig.providers.comfyui.apiKey])
  useEffect(() => () => trackingRef.current?.abort(), [])
  const startGeneration = async (overridePrompt?: string) => {
    if (!idbHydrated || isGeneratingRef.current) return
    if (activeTaskRef.current) { toast.error('存在待确认任务，请先恢复或明确停止跟踪'); return }
    const recipeSnapshot = recipe
    const configSnapshot = apiConfig
    const finalPrompt = overridePrompt ?? customPrompt ?? buildRecipePrompt(recipeSnapshot, configSnapshot.stylePreset, configSnapshot.activeProvider === 'comfyui' && recipeSnapshot.workflowImagesIdentity === workflowIdentity(configSnapshot.comfyuiParams.workflowJson) ? Object.values(recipeSnapshot.workflowImages || {}) : [])
    let record: ActiveTask = { prompt: finalPrompt, summary: [recipeSnapshot.portrait?.发型名称, recipeSnapshot.costume?.服装名称, recipeSnapshot.pose?.姿势名称].filter(Boolean).join(' + ') || '自定义合成' }
    isGeneratingRef.current = true
    setIsGenerating(true)
    setGeneratingModel(configSnapshot.activeProvider)
    setGenerationError('')
    setGenerationProgress(null)
    const controller = new AbortController()
    trackingRef.current = controller
    try {
      record.snapshot = await snapshotGeneration(recipeSnapshot, configSnapshot, finalPrompt)
      controller.signal.throwIfAborted()
      if (configSnapshot.activeProvider === 'comfyui') await idbWrite(TASK_KEY, null)
      const result = await generateCharacterImage({ recipe: recipeSnapshot, prompt: finalPrompt, config: configSnapshot, onProgress: setGenerationProgress, signal: controller.signal,
        onSubmitting: async (prepared) => {
          controller.signal.throwIfAborted()
          if (record.snapshot && prepared) record.snapshot.submittedWorkflowJson = JSON.stringify(prepared.workflow)
          await saveActive({ ...record, unknown: true })
          controller.signal.throwIfAborted()
        },
        onSubmitted: async (task) => {
          if (controller.signal.aborted) return
          record = { ...record, task }
          activeTaskRef.current = record
          setActiveTask(record)
          if (!controller.signal.aborted) await saveActive(record)
        },
      })
      controller.signal.throwIfAborted()
      await completeGeneration(result, record, controller.signal)
    } catch (e) {
      if (e instanceof ComfySubmissionRejectedError || (e instanceof ComfyTaskError && e.reason === 'failed')) {
        try { await saveActive(null) } catch { toast.error('任务失败记录未能清除，请停止跟踪后重试') }
      }
      const msg = e instanceof Error ? e.message : '调用失败'
      setGenerationError(msg)
      toast.error(msg.split('\n')[0])
    } finally { isGeneratingRef.current = false; setIsGenerating(false) }
  }

  return (
    <StudioContext.Provider
      value={{
        comfyConnection, checkComfyConnection, setComfyConnectionVisible,
        hydrated: idbHydrated,
        activeTask, resumeGeneration, stopTracking,
        recipe,
        apiConfig,
        history,
        customPrompt,
        setCustomPrompt,
        previewUrl,
        setPreviewUrl,
        isGenerating,
        generatingModel,
        generationProgress,
        generationError,
        startGeneration,
        refreshStitchPreview,
        setPortrait,
        setCostume,
        setPose,
        togglePortrait,
        toggleCostume,
        togglePose,
        addExtraImage,
        replaceExtraImage,
        removeExtraImage,
        updateExtraImageName,
        setWorkflowImage,
        clearRecipe,
        randomizeRecipe,
        randomizeSlot,
        updateApiConfig,
        updateProviderConfig,
        updateGptParams,
        updateGeminiParams,
        updateQwenParams,
        updateDoubaoParams,
        updateComfyUiParams,
        addHistory,
        removeHistoryItem,
        clearHistory,
      }}
    >
      {children}

    </StudioContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}
