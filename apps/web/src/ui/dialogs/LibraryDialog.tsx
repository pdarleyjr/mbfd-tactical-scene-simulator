import { useEffect, useRef, useState } from 'react'
import { Download, FileImage, FolderOpen, History, ImagePlus, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { MAIN_SCENE_ID } from '@mbfd/domain'
import { useUi } from '../../store/ui'
import { deleteDeviceBoard, exportCurrentBoard, exportImage, importSceneFile, listDeviceBoards, listServerSnapshots, newScenarioFromImage, startOwnSimulation, openDeviceBoard, restoreServerSnapshot, switchScenario, type ServerSnapshot } from '../../lib/workspace'
import { templates } from '../../templates'
import { useBoard } from '../../store/board'
import { goToScene, useLive } from '../../lib/live'
import { scenePath } from '../../lib/route'
import { recentScenes } from '../../lib/recent'
import type { BoardSummary } from '../../lib/storage'
import { formatRelative } from '../../lib/format'
import { Button, IconButton, Modal } from '../primitives'

/** Live scenes, the server's saved versions of this one, and older boards from this device. */
export function LibraryDialog() {
  const close = useUi((state) => state.closeDialog)
  const sceneId = useLive((state) => state.sceneId)
  const solo = useLive((state) => state.access?.kind === 'solo')
  const currentTemplateId = useBoard((state) => state.board.templateId)
  const [snapshots, setSnapshots] = useState<ServerSnapshot[] | null>(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [deviceBoards, setDeviceBoards] = useState<BoardSummary[]>([])
  const [creating, setCreating] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const recent = recentScenes().filter((item) => item.id !== sceneId)

  async function refresh() {
    listServerSnapshots(sceneId).then(setSnapshots, (error: unknown) => setSnapshotError(error instanceof Error ? error.message : 'Saved versions could not be loaded.'))
    setDeviceBoards(await listDeviceBoards().catch(() => []))
  }
  useEffect(() => { void refresh() }, []) // oxlint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>, closeAfter = false) {
    try {
      await action()
      if (closeAfter) close()
      else await refresh()
    } catch (error) {
      useUi.getState().toast(error instanceof Error ? error.message : 'That did not work.', 'error')
    }
  }

  return (
    <Modal
      title="Scenes"
      subtitle="Scenes are shared live and saved on the server. Everyone with a scene's link works on it together."
      onClose={close}
      size="lg"
      testId="library-dialog"
    >
      <h3 className="library__heading">Scenario</h3>
      <p className="fine-print">Everyone in this scene switches with you. Work on each scenario is kept, so switching back picks up where it left off.</p>
      <ul className="scenario-picker" data-testid="scenario-picker">
        {templates.map((template) => {
          const current = template.id === currentTemplateId
          return (
            <li key={template.id} className={`scenario-card ${current ? 'is-current' : ''}`} data-scenario={template.id}>
              <img className="scenario-card__thumb" src={template.thumbnailUrl} alt="" width={160} height={104} />
              <div className="scenario-card__meta">
                <strong>{template.scenario.title}</strong>
                <span>{current ? (solo ? 'Showing now' : 'Showing now for everyone in this simulation') : template.scenario.video ? 'With initial-conditions video' : 'Map only'}</span>
              </div>
              {current
                ? <span className="scenario-card__badge">Current</span>
                : <Button tone="primary" onClick={() => { switchScenario(template.id); close() }} data-testid={`switch-to-${template.id}`}>{solo ? 'Switch' : 'Switch everyone'}</Button>}
            </li>
          )
        })}
      </ul>

      <div className="library__actions">
        <Button tone="primary" icon={<Plus size={18} />} onClick={() => void run(() => startOwnSimulation(), true)} data-testid="new-separate-scene">Start a new simulation of my own</Button>
        <Button icon={<ImagePlus size={18} />} onClick={() => setCreating((value) => !value)} aria-expanded={creating}>New scenario from an image</Button>
        <Button icon={<Upload size={18} />} onClick={() => importRef.current?.click()} data-testid="import-scene">Import scene file</Button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden data-testid="import-input" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => importSceneFile(file), true) }} />
      </div>
      {creating && <NewScenarioForm />}

      <h3 className="library__heading"><History size={17} aria-hidden /> Saved versions of this scene</h3>
      <p className="fine-print">The server saves a version every few minutes, before a reset or restore, and when the last person leaves. Restoring changes the scene for everyone; the current state is saved first.</p>
      {snapshotError && <p className="status-line status-line--warning">{snapshotError}</p>}
      {!snapshots && !snapshotError && <p className="fine-print">Loading…</p>}
      {snapshots?.length === 0 && <p className="fine-print">No saved versions yet.</p>}
      <ul className="library__list library__list--compact" data-testid="snapshot-list">
        {snapshots?.slice(0, 30).map((snapshot) => (
          <li key={snapshot.name} className="board-card board-card--compact">
            <div className="board-card__meta">
              <strong>{new Date(snapshot.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
              <span>{snapshot.title ? `${snapshot.title} · ` : ''}{snapshot.reason} · {snapshot.objectCount} objects · {formatRelative(snapshot.savedAt)}</span>
            </div>
            <div className="board-card__actions">
              <Button icon={<RotateCcw size={16} />} onClick={() => void run(() => restoreServerSnapshot(sceneId, snapshot.name), true)}>Restore</Button>
            </div>
          </li>
        ))}
      </ul>

      {(sceneId !== MAIN_SCENE_ID || recent.length > 0) && <h3 className="library__heading">Other simulations</h3>}
      <ul className="library__list library__list--compact" data-testid="recent-scenes">
        {sceneId !== MAIN_SCENE_ID && !recent.some((item) => item.id === MAIN_SCENE_ID) && (
          <li className="board-card board-card--compact">
            <div className="board-card__meta"><strong>Main scene</strong><span>The original shared scene, now opened by its own link</span></div>
            <div className="board-card__actions"><Button onClick={() => goToScene(MAIN_SCENE_ID)}>Open</Button></div>
          </li>
        )}
        {recent.map((item) => (
          <li key={item.id} className="board-card board-card--compact">
            <div className="board-card__meta">
              <strong>{item.id === MAIN_SCENE_ID ? 'Main scene' : item.name}</strong>
              <span>{item.id === MAIN_SCENE_ID ? item.name : scenePath(item.id)} · visited {formatRelative(item.visitedAt)}</span>
            </div>
            <div className="board-card__actions"><Button onClick={() => goToScene(item.id)}>Open</Button></div>
          </li>
        ))}
      </ul>

      {deviceBoards.length > 0 && (
        <>
          <h3 className="library__heading">Saved on this device</h3>
          <p className="fine-print">Boards kept in this browser before scenes were shared. Open one as a separate live scene to work on it with others.</p>
          <ul className="library__list" data-testid="board-list">
            {deviceBoards.map((summary) => (
              <li key={summary.id} className="board-card">
                <span className="board-card__thumb" aria-hidden>
                  {summary.thumbnail ? <img src={summary.thumbnail} alt="" /> : <span className="board-card__placeholder"><FolderOpen size={26} /></span>}
                </span>
                <div className="board-card__meta">
                  <strong>{summary.name}</strong>
                  <span>{summary.objectCount} objects · edited {formatRelative(summary.updatedAt)}</span>
                </div>
                <div className="board-card__actions">
                  <Button onClick={() => void run(() => openDeviceBoard(summary.id), true)}>Open as separate scene</Button>
                  <IconButton label={`Remove ${summary.name} from this device`} onClick={() => void run(() => deleteDeviceBoard(summary.id))}><Trash2 size={16} /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="library__foot">
        <Button icon={<Download size={18} />} onClick={() => void exportCurrentBoard()} data-testid="export-scene">Download this scene file</Button>
        <Button icon={<FileImage size={18} />} onClick={() => void exportImage()}>Download image (PNG)</Button>
      </div>
    </Modal>
  )
}

function NewScenarioForm() {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="new-scenario" onSubmit={(event) => {
      event.preventDefault()
      if (!file) { setError('Choose an aerial image.'); return }
      setBusy(true)
      newScenarioFromImage(file, title).catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : 'That image could not be used.'); setBusy(false) })
    }}>
      <p className="fine-print">Creates a separate live scene on your image, with its own link.</p>
      <label className="field">
        <span className="field__label">Scenario title</span>
        <input className="input" value={title} maxLength={160} placeholder="e.g. Commercial fire, Collins Ave" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Aerial or plan image</span>
        <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="status-line status-line--warning">{error}</p>}
      <Button tone="primary" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Create scenario'}</Button>
    </form>
  )
}
