import { useEffect, useRef, useState } from 'react'
import { Copy, Download, FileImage, FolderOpen, ImagePlus, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { captureThumbnail, deleteBoard, duplicateBoard, exportCurrentBoard, exportImage, importSceneFile, listBoards, newBoardFromTemplate, newScenarioFromImage, openBoard, renameBoard, useSaveStatus } from '../../lib/workspace'
import type { BoardSummary } from '../../lib/storage'
import { formatRelative } from '../../lib/format'
import { Button, IconButton, Modal } from '../primitives'

/** Scenes saved in this browser, plus import, export, and new-scenario actions. */
export function LibraryDialog() {
  const close = useUi((state) => state.closeDialog)
  const currentId = useBoard((state) => state.board.id)
  const status = useSaveStatus()
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setBoards(await listBoards())
  }
  useEffect(() => {
    void captureThumbnail().finally(() => { void refresh() })
  }, [])

  async function run(action: () => Promise<unknown>, closeAfter = false) {
    await action()
    if (closeAfter) close()
    else await refresh()
  }

  return (
    <Modal
      title="Scenes"
      subtitle={status.durable ? 'Saved automatically in this browser on this device. They do not sync between devices: download a scene file to move one.' : 'This browser is not keeping data (private browsing). Download a scene file before closing.'}
      onClose={close}
      size="lg"
      testId="library-dialog"
    >
      <div className="library__actions">
        <Button tone="primary" icon={<Plus size={18} />} onClick={() => void run(() => newBoardFromTemplate(), true)} data-testid="new-from-template">New board from the original scenario</Button>
        <Button icon={<ImagePlus size={18} />} onClick={() => setCreating((value) => !value)} aria-expanded={creating}>New scenario from an image</Button>
        <Button icon={<Upload size={18} />} onClick={() => importRef.current?.click()} data-testid="import-scene">Import scene file</Button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden data-testid="import-input" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => importSceneFile(file), true) }} />
      </div>
      {creating && <NewScenarioForm onDone={close} />}
      <h3 className="library__heading">On this device</h3>
      {!boards && <p className="fine-print">Loading…</p>}
      <ul className="library__list" data-testid="board-list">
        {boards?.map((summary) => (
          <li key={summary.id} className={`board-card ${summary.id === currentId ? 'is-current' : ''}`}>
            <button type="button" className="board-card__thumb" onClick={() => void run(() => openBoard(summary.id), true)} aria-label={`Open ${summary.name}`}>
              {summary.thumbnail ? <img src={summary.thumbnail} alt="" /> : <span className="board-card__placeholder"><FolderOpen size={26} /></span>}
            </button>
            <div className="board-card__meta">
              {renaming === summary.id
                ? <input className="input" autoFocus defaultValue={summary.name} maxLength={120} aria-label="Scene name" onBlur={(event) => { setRenaming(null); void run(() => renameBoard(summary.id, event.target.value)) }} onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') setRenaming(null) }} />
                : <strong>{summary.name}</strong>}
              <span>{summary.id === currentId ? 'Open now · ' : ''}{summary.objectCount} objects · edited {formatRelative(summary.updatedAt)}</span>
            </div>
            <div className="board-card__actions">
              {summary.id !== currentId && <Button onClick={() => void run(() => openBoard(summary.id), true)}>Open</Button>}
              <IconButton label={`Rename ${summary.name}`} onClick={() => setRenaming(summary.id)}><Pencil size={16} /></IconButton>
              <IconButton label={`Duplicate ${summary.name}`} onClick={() => void run(() => duplicateBoard(summary.id))}><Copy size={16} /></IconButton>
              <IconButton label={`Delete ${summary.name}`} onClick={() => void run(() => deleteBoard(summary.id))}><Trash2 size={16} /></IconButton>
            </div>
          </li>
        ))}
      </ul>
      <div className="library__foot">
        <Button icon={<Download size={18} />} onClick={() => void exportCurrentBoard()} data-testid="export-scene">Download this scene file</Button>
        <Button icon={<FileImage size={18} />} onClick={() => void exportImage()}>Download image (PNG)</Button>
        <span className="fine-print">{status.persisted ? 'The browser has agreed not to clear this storage automatically.' : 'Download scene files for anything you need to keep long term.'}</span>
      </div>
    </Modal>
  )
}

function NewScenarioForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="new-scenario" onSubmit={(event) => {
      event.preventDefault()
      if (!file) { setError('Choose an aerial image.'); return }
      setBusy(true)
      newScenarioFromImage(file, title).then(onDone, (reason: unknown) => { setError(reason instanceof Error ? reason.message : 'That image could not be used.'); setBusy(false) })
    }}>
      <label className="field">
        <span className="field__label">Scenario title</span>
        <input className="input" value={title} maxLength={160} placeholder="e.g. Commercial fire, Collins Ave" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Aerial or plan image</span>
        <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="status-line status-line--warning">{error}</p>}
      <Button tone="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create scenario'}</Button>
    </form>
  )
}
