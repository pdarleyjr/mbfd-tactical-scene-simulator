import { Dialog } from '../Dialog'

export function VideoViewer({ open, onClose, source, poster }: { open: boolean; onClose: () => void; source?: string | undefined; poster?: string | undefined }) {
  return <Dialog title="Initial Conditions" open={open} onClose={onClose}>{source ? <video className="aspect-video w-full bg-black" src={source} poster={poster} controls playsInline preload="metadata"><track kind="captions" /></video> : <p className="muted p-6 text-center">No initial-conditions video is attached to this scenario.</p>}</Dialog>
}
