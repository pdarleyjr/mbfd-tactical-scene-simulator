import { useEffect } from 'react'
import { SceneStage } from './canvas/SceneStage'
import { useBoard } from './store/board'
import { useUi } from './store/ui'
import { bootWorkspace } from './lib/workspace'
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
import { LibraryDialog } from './ui/dialogs/LibraryDialog'
import { SettingsDialog } from './ui/dialogs/SettingsDialog'
import { CalibrationDialog, ResetDialog, ShortcutsDialog, VideoDialog } from './ui/dialogs/SmallDialogs'

export function App() {
  const hydrated = useBoard((state) => state.hydrated)
  const presenting = useUi((state) => state.presenting)
  const reviewing = useUi((state) => state.reviewing)
  const dialog = useUi((state) => state.dialog)
  useShortcuts()
  useInjectSchedule()
  useEffect(() => {
    bootWorkspace().catch((error: unknown) => {
      console.error('Startup failed', error)
      useBoard.setState({ hydrated: true })
      useUi.getState().toast('Saved scenes could not be opened, so the original scenario is shown. Changes may not be kept.', 'error')
    })
  }, [])

  return (
    <div className="app" data-presenting={presenting || undefined} data-reviewing={reviewing || undefined} data-ready={hydrated || undefined}>
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
    </div>
  )
}
