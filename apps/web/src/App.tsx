import { useEffect } from 'react'
import { SceneStage } from './canvas/SceneStage'
import { useBoard } from './store/board'
import { useUi } from './store/ui'
import { bootWorkspace } from './lib/workspace'
import { useLive } from './lib/live'
import type { Route } from './lib/route'
import { useShortcuts } from './hooks/useShortcuts'
import { useInjectSchedule } from './hooks/useInjectSchedule'
import { TopBar } from './ui/TopBar'
import { ToolDock } from './ui/ToolDock'
import { ToolTray } from './ui/ToolTray'
import { DraftBar } from './ui/DraftBar'
import { SidePanel } from './ui/SidePanel'
import { MapHud } from './ui/MapHud'
import { InjectBanner } from './ui/InjectBanner'
import { PresentOverlay } from './ui/PresentOverlay'
import { ReviewBar } from './ui/ReviewBar'
import { Banners, Toasts } from './ui/Toasts'
import { RoomGate } from './ui/RoomGate'
import { LibraryDialog } from './ui/dialogs/LibraryDialog'
import { SettingsDialog } from './ui/dialogs/SettingsDialog'
import { CalibrationDialog, ResetDialog, ShortcutsDialog, VideoDialog } from './ui/dialogs/SmallDialogs'

export function App({ route }: { route: Extract<Route, { kind: 'scene' }> }) {
  const hydrated = useBoard((state) => state.hydrated)
  const presenting = useUi((state) => state.presenting)
  const reviewing = useUi((state) => state.reviewing)
  const dialog = useUi((state) => state.dialog)
  const display = useUi((state) => state.display)
  const connection = useLive((state) => state.connection)
  const denied = useLive((state) => state.denied)
  useShortcuts()
  useInjectSchedule()
  useEffect(() => {
    bootWorkspace(route).catch((error: unknown) => {
      console.error('Startup failed', error)
      useBoard.setState({ hydrated: true })
      useUi.getState().toast('The scene could not be opened, so the original scenario is shown. Changes may not be kept.', 'error')
    })
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app" data-presenting={presenting || undefined} data-reviewing={reviewing || undefined} data-ready={hydrated || undefined} data-display={display || undefined} data-live={connection}>
      <SceneStage />
      {!presenting && <TopBar />}
      {!presenting && !reviewing && <ToolDock />}
      {!presenting && !reviewing && <ToolTray />}
      {!reviewing && <DraftBar />}
      <SidePanel />
      {!reviewing && <MapHud />}
      <InjectBanner />
      {presenting && <PresentOverlay />}
      {reviewing && <ReviewBar />}
      <Banners />
      {dialog === 'none' && <Toasts />}
      {dialog === 'library' && <LibraryDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'calibrate' && <CalibrationDialog />}
      {dialog === 'video' && <VideoDialog />}
      {dialog === 'reset' && <ResetDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {denied && <RoomGate />}
    </div>
  )
}
