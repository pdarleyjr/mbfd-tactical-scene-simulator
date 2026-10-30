import { MAIN_SCENE_ID, sceneIdSchema } from '@mbfd/domain'

/**
 * Which screen an address opens. The site address itself opens the start
 * screen, where the visitor chooses a private or a shared simulation. A
 * simulation lives at /s/<id>. Nothing is ever joined just by visiting.
 */

export type Route =
  | { kind: 'entry' }
  | { kind: 'scene'; sceneId: string; display: boolean }

export function isDisplayView(search: string): boolean {
  return new URLSearchParams(search).get('view') === 'present'
}

export function routeFromLocation(pathname: string, search: string): Route {
  const display = isDisplayView(search)
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname)
  const candidate = match?.[1]?.toLowerCase()
  if (candidate && sceneIdSchema.safeParse(candidate).success) return { kind: 'scene', sceneId: candidate, display }
  // Classroom TVs were bookmarked on the old display address, which showed the main scene. That one view-only address keeps working.
  if ((pathname === '/' || pathname === '') && display) return { kind: 'scene', sceneId: MAIN_SCENE_ID, display: true }
  return { kind: 'entry' }
}

export function scenePath(sceneId: string): string {
  return `/s/${sceneId}`
}

export function sceneLink(sceneId: string, options: { display?: boolean } = {}): string {
  return `${location.origin}${scenePath(sceneId)}${options.display ? '?view=present' : ''}`
}

/**
 * What a person typed or pasted into "join with a code": a bare code, a
 * simulation link, or a link with extra parts. Returns the scene id, or
 * undefined when nothing usable is there.
 */
export function sceneIdFromInput(input: string): string | undefined {
  const text = input.trim().toLowerCase()
  if (!text) return undefined
  const fromLink = /\/s\/([a-z0-9]+)/.exec(text)?.[1]
  const candidate = fromLink ?? text.replace(/[\s-]/g, '')
  return sceneIdSchema.safeParse(candidate).success ? candidate : undefined
}
