import { hoseCatalog, type Board, type HoseObject } from '@mbfd/domain'
import { analyzeWaterSupply, describeHose, readHose } from '@mbfd/fire-model'
import { formatElapsed } from './format'
import { downloadText, exportFileName } from './scene-files'

/** Plain-text training summary for records or a follow-up email. */
export function debriefMarkdown(board: Board, now = new Date()): string {
  const { scenario, training, objects } = board
  const index = new Map(objects.map((object) => [object.id, object]))
  const report = analyzeWaterSupply(objects, { loads: scenario.hoseLoads, calibration: scenario.calibration })
  const lines: string[] = []
  lines.push(`# ${scenario.title}`, '', `Board: ${board.name}  `, `Generated: ${now.toLocaleString()}  `, `Scenario time: ${formatElapsed(training.timer.accumulatedMs)}`, '')
  if (scenario.dispatch) lines.push('## Dispatch', '', scenario.dispatch, '')
  lines.push('## Benchmarks', '')
  for (const benchmark of scenario.benchmarks) {
    const at = training.completed[benchmark.id]
    lines.push(`- [${at !== undefined ? 'x' : ' '}] ${benchmark.label}${at !== undefined ? ` (${formatElapsed(at)})` : ''}`)
  }
  lines.push('', '## Injects', '')
  if (!scenario.injects.length) lines.push('None.')
  for (const inject of scenario.injects) {
    const at = training.revealed[inject.id]
    lines.push(`- ${inject.title}: ${at !== undefined ? `revealed at ${formatElapsed(at)}` : 'not revealed'}`)
  }
  lines.push('', '## Apparatus', '')
  const units = objects.filter((object) => object.type === 'apparatus')
  if (!units.length) lines.push('None placed.')
  for (const unit of units) {
    if (unit.type !== 'apparatus') continue
    const supply = report.apparatus.get(unit.id)
    const state = supply?.supplied ? `supplied from ${supply.hydrantIds.map((id) => { const hydrant = index.get(id); return hydrant?.type === 'hydrant' ? hydrant.label : id }).join(', ')}` : supply?.outputLineIds.length ? 'tank water only' : 'no lines'
    lines.push(`- ${unit.label}${unit.assignment ? `, ${unit.assignment}` : ''}: ${state}`)
  }
  lines.push('', `## Hose lines${scenario.calibration ? '' : ' (map not calibrated: lengths in map units)'}`, '')
  const hoses = objects.filter((object): object is HoseObject => object.type === 'hose')
  if (!hoses.length) lines.push('None laid.')
  for (const hose of hoses) {
    const reading = readHose(hose, scenario.hoseLoads, scenario.calibration)
    lines.push(`- ${describeHose(hose, index)}: ${reading.length.text}${reading.sections ? `, ${reading.sections} × ${reading.sectionLengthFt} ft sections` : ''}${reading.overLoadFt ? `, ${Math.round(reading.overLoadFt)} ft over the ${reading.loadFt} ft load` : ''}`)
  }
  if (report.issues.length) {
    lines.push('', '## Open items', '')
    for (const issue of report.issues) lines.push(`- ${issue.message}`)
  }
  if (training.notes.trim()) lines.push('', '## Notes', '', training.notes.trim())
  lines.push('', '---', `Hose colors: ${Object.values(hoseCatalog).map((hose) => hose.label).join(', ')}. Connectivity only; no hydraulic calculation.`)
  return lines.join('\n')
}

export function downloadDebrief(board: Board) {
  downloadText(exportFileName(board).replace('.mbfd-scene.json', '-debrief.md'), debriefMarkdown(board), 'text/markdown')
}
