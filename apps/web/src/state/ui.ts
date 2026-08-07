import { create } from 'zustand'
import type { EvolutionId } from '@mbfd/domain'

export type CanvasMode = 'select' | 'pan' | 'hydrant' | 'hose-attack175' | 'hose-hose3' | 'hose-supply5' | 'annotation' | 'marker'

interface UiState {
  canvasMode: CanvasMode
  selectedObjectId: string | undefined
  placementTemplateId: string | undefined
  selectedEvolutionId: EvolutionId | undefined
  videoOpen: boolean
  toolRailOpen: boolean
  setCanvasMode: (mode: CanvasMode) => void
  selectObject: (id?: string) => void
  setPlacementTemplate: (id?: string) => void
  setEvolution: (id?: EvolutionId) => void
  setVideoOpen: (open: boolean) => void
  setToolRailOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  canvasMode: 'select',
  selectedObjectId: undefined,
  placementTemplateId: undefined,
  selectedEvolutionId: undefined,
  videoOpen: false,
  toolRailOpen: true,
  setCanvasMode: (canvasMode) => set({ canvasMode, placementTemplateId: undefined, selectedEvolutionId: undefined }),
  selectObject: (selectedObjectId) => set({ selectedObjectId }),
  setPlacementTemplate: (placementTemplateId) => set({ placementTemplateId, selectedEvolutionId: undefined, canvasMode: 'select' }),
  setEvolution: (selectedEvolutionId) => set({ selectedEvolutionId, placementTemplateId: undefined, canvasMode: 'select' }),
  setVideoOpen: (videoOpen) => set({ videoOpen }),
  setToolRailOpen: (toolRailOpen) => set({ toolRailOpen }),
}))
