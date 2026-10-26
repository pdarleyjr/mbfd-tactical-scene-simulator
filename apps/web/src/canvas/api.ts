import type { Vec } from '@mbfd/fire-model'

/**
 * Imperative entry points the HTML chrome uses to reach the canvas: dropping
 * a vehicle dragged from the tray, fitting the view, and rendering images.
 */
export interface CanvasApi {
  clientToWorld(clientX: number, clientY: number): Vec | undefined
  viewCenter(): Vec
  fit(): void
  zoomBy(factor: number): void
  centerOn(point: Vec): void
  /** Full-scene PNG at roughly the image's native resolution. */
  exportPng(): Promise<Blob | undefined>
  /** Small JPEG data URL for the scene library. */
  thumbnail(): string | undefined
}

export const canvasApi: { current: CanvasApi | null } = { current: null }
