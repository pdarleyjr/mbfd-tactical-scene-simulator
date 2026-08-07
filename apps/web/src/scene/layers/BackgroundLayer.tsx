import { Image, Layer, Rect } from 'react-konva'
import { useImage } from '../useImage'

export function BackgroundLayer({ source, width, height }: { source: string; width: number; height: number }) {
  const image = useImage(source)
  return <Layer listening={false}><Image image={image} x={0} y={0} width={width} height={height} /><Rect width={width} height={height} stroke="#d9c8a5" strokeWidth={2}/></Layer>
}
