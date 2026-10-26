import { create } from 'zustand'
import type { ApparatusTemplateId, EvolutionId, HosePurpose, HoseType, MarkerType, NozzleObject, PortRef } from '@mbfd/domain'
import type { EvolutionStep, Vec } from '@mbfd/fire-model'
import type { ViewportTransform } from '../canvas/viewport'

export type Tool = 'select' | 'apparatus' | 'hose' | 'hydrant' | 'marker' | 'note' | 'arrow' | 'measure' | 'calibrate'

export type HoseChoice =
  | { kind: 'free'; hoseType: HoseType; purpose: HosePurpose }
  | { kind: 'evolution'; evolutionId: EvolutionId; nozzle: NozzleObject['nozzleType'] }

export interface Draft {
  kind: 'hose' | 'arrow' | 'measure' | 'calibrate'
  points: number[]
  from?: PortRef | undefined
  /** Evolution being laid, with the step in progress. */
  steps?: EvolutionStep[] | undefined
  stepIndex?: number | undefined
  evolutionId?: EvolutionId | undefined
  /** Extending an existing hose from its open end. */
  continueHoseId?: string | undefined
  /** Points that belonged to the hose before extending; undo never trims these. */
  basePointCount?: number | undefined
}

export type Panel = 'none' | 'training' | 'supply'
export type Dialog = 'none' | 'library' | 'settings' | 'calibrate' | 'video' | 'shortcuts' | 'reset'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'warning' | 'error'
  action?: { label: string; run: () => void } | undefined
}

export interface Layers {
  labels: boolean
  hoseLengths: boolean
  flow: boolean
  markers: boolean
}

interface UiStore {
  tool: Tool
  apparatusTemplate: ApparatusTemplateId | null
  markerType: MarkerType
  hoseChoice: HoseChoice
  arrowColor: 'white' | 'yellow' | 'red' | 'blue'
  selection: string[]
  view: ViewportTransform
  panel: Panel
  dialog: Dialog
  presenting: boolean
  reviewing: boolean
  reviewAtMs: number
  compareSnapshotId: string | null
  layers: Layers
  draft: Draft | null
  /** Live pointer position for draft previews, in world units. */
  cursor: Vec | null
  /** Last rotation used per vehicle so repeat placements line up. */
  lastRotation: Partial<Record<ApparatusTemplateId, number>>
  pendingCalibration: { a: Vec; b: Vec } | null
  bannerInjectId: string | null
  otherTabChanged: boolean
  toasts: Toast[]
  setTool(tool: Tool): void
  armApparatus(templateId: ApparatusTemplateId | null): void
  setMarkerType(markerType: MarkerType): void
  setHoseChoice(choice: HoseChoice): void
  setArrowColor(color: UiStore['arrowColor']): void
  select(ids: string[]): void
  toggleSelected(id: string): void
  setView(view: ViewportTransform | ((view: ViewportTransform) => ViewportTransform)): void
  setPanel(panel: Panel): void
  togglePanel(panel: Exclude<Panel, 'none'>): void
  openDialog(dialog: Dialog): void
  closeDialog(): void
  setPresenting(presenting: boolean): void
  setReviewing(reviewing: boolean): void
  setReviewAt(ms: number): void
  setCompareSnapshot(id: string | null): void
  toggleLayer(layer: keyof Layers): void
  setDraft(draft: Draft | null): void
  setCursor(cursor: Vec | null): void
  rememberRotation(templateId: ApparatusTemplateId, rotation: number): void
  setPendingCalibration(pending: UiStore['pendingCalibration']): void
  showInjectBanner(id: string | null): void
  setOtherTabChanged(changed: boolean): void
  toast(message: string, tone?: Toast['tone'], action?: Toast['action']): void
  dismissToast(id: number): void
}

let toastCounter = 0

export const useUi = create<UiStore>()((set, get) => ({
  tool: 'select',
  apparatusTemplate: null,
  markerType: 'command-post',
  hoseChoice: { kind: 'evolution', evolutionId: 'jumpline', nozzle: 'fog' },
  arrowColor: 'white',
  selection: [],
  view: { x: 0, y: 0, scale: 1 },
  panel: 'none',
  dialog: 'none',
  presenting: false,
  reviewing: false,
  reviewAtMs: 0,
  compareSnapshotId: null,
  layers: { labels: true, hoseLengths: true, flow: true, markers: true },
  draft: null,
  cursor: null,
  lastRotation: {},
  pendingCalibration: null,
  bannerInjectId: null,
  otherTabChanged: false,
  toasts: [],

  setTool(tool) {
    set({ tool, draft: null, ...(tool !== 'apparatus' ? { apparatusTemplate: null } : {}), ...(tool !== 'select' ? { selection: [] } : {}) })
  },
  armApparatus(templateId) {
    set({ apparatusTemplate: templateId, tool: templateId ? 'apparatus' : get().tool === 'apparatus' ? 'apparatus' : get().tool, draft: null, selection: [] })
  },
  setMarkerType(markerType) { set({ markerType, tool: 'marker', draft: null, selection: [] }) },
  setHoseChoice(hoseChoice) { set({ hoseChoice, tool: 'hose', draft: null, selection: [] }) },
  setArrowColor(arrowColor) { set({ arrowColor }) },
  select(ids) { set({ selection: [...new Set(ids)] }) },
  toggleSelected(id) {
    const selection = get().selection
    set({ selection: selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id] })
  },
  setView(view) { set({ view: typeof view === 'function' ? view(get().view) : view }) },
  setPanel(panel) { set({ panel }) },
  togglePanel(panel) { set({ panel: get().panel === panel ? 'none' : panel }) },
  openDialog(dialog) { set({ dialog }) },
  closeDialog() { set({ dialog: 'none' }) },
  setPresenting(presenting) { set({ presenting, ...(presenting ? { tool: 'select' as Tool, draft: null } : {}) }) },
  setReviewing(reviewing) { set({ reviewing, selection: [], draft: null, tool: 'select', ...(reviewing ? {} : { reviewAtMs: 0 }) }) },
  setReviewAt(reviewAtMs) { set({ reviewAtMs }) },
  setCompareSnapshot(compareSnapshotId) { set({ compareSnapshotId }) },
  toggleLayer(layer) { set({ layers: { ...get().layers, [layer]: !get().layers[layer] } }) },
  setDraft(draft) { set({ draft }) },
  setCursor(cursor) { set({ cursor }) },
  rememberRotation(templateId, rotation) { set({ lastRotation: { ...get().lastRotation, [templateId]: rotation } }) },
  setPendingCalibration(pendingCalibration) { set({ pendingCalibration }) },
  showInjectBanner(bannerInjectId) { set({ bannerInjectId }) },
  setOtherTabChanged(otherTabChanged) { set({ otherTabChanged }) },
  toast(message, tone = 'info', action) {
    const id = ++toastCounter
    set({ toasts: [...get().toasts.slice(-3), { id, message, tone, action }] })
    setTimeout(() => get().dismissToast(id), action ? 7000 : 4200)
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((toast) => toast.id !== id) }) },
}))
