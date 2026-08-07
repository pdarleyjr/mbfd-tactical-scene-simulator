import { useEffect, useState } from 'react'

export function useImage(source: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement>()
  useEffect(() => {
    if (!source) { setImage(undefined); return }
    const next = new Image()
    next.decoding = 'async'
    next.crossOrigin = 'anonymous'
    next.onload = () => setImage(next)
    next.src = source
    return () => { next.onload = null }
  }, [source])
  return image
}
