import { useUi } from '../store/ui'

/** Copies a link, or shows it when the browser refuses clipboard access. */
export async function copyLink(url: string, what: string) {
  try {
    await navigator.clipboard.writeText(url)
    useUi.getState().toast(`${what} copied.`, 'success')
  } catch {
    useUi.getState().toast(`${what}: ${url}`, 'info')
  }
}
