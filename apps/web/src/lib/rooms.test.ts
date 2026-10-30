import { describe, expect, it } from 'vitest'
import { hostFromHash, ownerLink, parseHostedRooms } from './rooms'

const key = 'k'.repeat(32)

describe('simulations this browser started', () => {
  it('reads the stored list and drops anything malformed', () => {
    const good = { id: 'abcd2345wxyz', kind: 'solo', hostKey: key, createdAt: 1 }
    const text = JSON.stringify([good, { id: 'BAD ID', kind: 'solo', hostKey: key, createdAt: 1 }, { ...good, id: 'abcd2345wxya', kind: 'public' }, { ...good, id: 'abcd2345wxyb', hostKey: 'short' }, { ...good, id: 'abcd2345wxyc', createdAt: 'x' }, null, 5])
    expect(parseHostedRooms(text)).toEqual([good])
    expect(parseHostedRooms(null)).toEqual([])
    expect(parseHostedRooms('not json')).toEqual([])
    expect(parseHostedRooms('{"a":1}')).toEqual([])
  })

  it('builds an owner link whose key stays after the # and reads it back', () => {
    const link = ownerLink({ id: 'abcd2345wxyz', kind: 'solo', hostKey: key }, 'https://firesim.mbfdhub.com')
    expect(link).toBe(`https://firesim.mbfdhub.com/s/abcd2345wxyz#host=${key}&kind=solo`)
    const url = new URL(link)
    expect(url.search).toBe('')
    expect(hostFromHash(url.hash)).toEqual({ hostKey: key, kind: 'solo' })
  })

  it('treats an unreadable or missing key in a link as no key at all', () => {
    expect(hostFromHash('')).toBeUndefined()
    expect(hostFromHash('#host=short')).toBeUndefined()
    expect(hostFromHash(`#kind=solo`)).toBeUndefined()
    expect(hostFromHash(`#host=${key}`)).toEqual({ hostKey: key, kind: 'shared' })
  })
})
