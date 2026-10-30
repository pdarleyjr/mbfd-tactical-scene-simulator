import { describe, expect, it } from 'vitest'
import { routeFromLocation, sceneIdFromInput } from './route'

describe('which screen an address opens', () => {
  it('opens the start screen for the site address, so a plain visit joins nothing', () => {
    expect(routeFromLocation('/', '')).toEqual({ kind: 'entry' })
    expect(routeFromLocation('', '')).toEqual({ kind: 'entry' })
    expect(routeFromLocation('/index.html', '')).toEqual({ kind: 'entry' })
    expect(routeFromLocation('/', '?utm=1')).toEqual({ kind: 'entry' })
  })

  it('opens a simulation only at an explicit /s/<id> address', () => {
    expect(routeFromLocation('/s/abcd2345wxyz', '')).toEqual({ kind: 'scene', sceneId: 'abcd2345wxyz', display: false })
    expect(routeFromLocation('/s/abcd2345wxyz/', '')).toEqual({ kind: 'scene', sceneId: 'abcd2345wxyz', display: false })
    // Ids are lowercase; a pasted link in capitals still finds the room.
    expect(routeFromLocation('/s/ABCD2345WXYZ', '')).toEqual({ kind: 'scene', sceneId: 'abcd2345wxyz', display: false })
    // Older shared scenes keep their links, including the original main scene.
    expect(routeFromLocation('/s/main', '')).toEqual({ kind: 'scene', sceneId: 'main', display: false })
  })

  it('no longer treats a malformed scene address as the main scene', () => {
    for (const path of ['/s/', '/s/a', '/s/not*valid', '/s/has space', '/s/abc/def', '/s/' + 'x'.repeat(40)]) {
      expect(routeFromLocation(path, '')).toEqual({ kind: 'entry' })
    }
  })

  it('opens a classroom display on the scene it names, view only', () => {
    expect(routeFromLocation('/s/abcd2345wxyz', '?view=present')).toEqual({ kind: 'scene', sceneId: 'abcd2345wxyz', display: true })
    expect(routeFromLocation('/s/abcd2345wxyz', '?view=edit')).toEqual({ kind: 'scene', sceneId: 'abcd2345wxyz', display: false })
  })

  it('keeps the one old display bookmark working: the bare address with view=present shows the main scene, read only', () => {
    expect(routeFromLocation('/', '?view=present')).toEqual({ kind: 'scene', sceneId: 'main', display: true })
  })
})

describe('reading an invite someone typed or pasted', () => {
  it('accepts a full link, a bare code, and a link with extra parts', () => {
    expect(sceneIdFromInput('https://firesim.mbfdhub.com/s/abcd2345wxyz')).toBe('abcd2345wxyz')
    expect(sceneIdFromInput('  https://firesim.mbfdhub.com/s/abcd2345wxyz?view=present  ')).toBe('abcd2345wxyz')
    expect(sceneIdFromInput('abcd2345wxyz')).toBe('abcd2345wxyz')
    expect(sceneIdFromInput('ABCD-2345-WXYZ')).toBe('abcd2345wxyz')
    expect(sceneIdFromInput('main')).toBe('main')
  })

  it('refuses anything that cannot be a scene id', () => {
    for (const text of ['', '   ', 'abc', 'has*symbols', 'https://example.com/', 'x'.repeat(40)]) {
      expect(sceneIdFromInput(text)).toBeUndefined()
    }
  })
})
