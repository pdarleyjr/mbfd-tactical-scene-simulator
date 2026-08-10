import { apparatusCatalog, defaultBenchmarkCatalog, evolutionCatalog } from '@mbfd/domain'
import type { ScenarioRecord } from './model.js'

const now = '2026-08-07T00:00:00.000Z'
const backgroundAssetId = '22222222-2222-4222-8222-222222222222'
const videoAssetId = '33333333-3333-4333-8333-333333333333'

export const initialScenario: ScenarioRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'residential-waterfront-estate',
  title: 'Residential Structure Fire — Waterfront Estate',
  description: 'A rendered residential structure-fire scene for multi-company tactical training.',
  dispatchInformation: 'Residential structure fire with visible exterior fire conditions. Responding companies should position, establish water, and coordinate the initial attack.',
  worldWidth: 1586,
  worldHeight: 992,
  apparatusTemplateIds: apparatusCatalog.map((template) => template.id),
  evolutionIds: evolutionCatalog.map((evolution) => evolution.id),
  benchmarks: defaultBenchmarkCatalog.map((benchmark) => ({ ...benchmark })),
  injects: [
    { title: 'Occupant report', description: 'A neighbor reports that one occupant may still be inside.' },
    { title: 'Changing conditions', description: 'Fire begins extending toward the upper floor.' },
  ],
  staticObjects: [],
  backgroundAssetId,
  videoAssetId,
  assets: [
    {
      id: backgroundAssetId, scenarioId: '11111111-1111-4111-8111-111111111111', kind: 'background',
      originalPath: 'source/aerial_view_for_house_fire.png', runtimePath: 'seed/background.webp', thumbnailPath: 'seed/background-thumb.webp',
      mimeType: 'image/webp', byteSize: 694404, width: 1586, height: 992, sha256: '0d9f3b32bf909332c6c7e8b635dec81049510495424e4dac6ceddf8c579e316a', createdAt: now,
    },
    {
      id: videoAssetId, scenarioId: '11111111-1111-4111-8111-111111111111', kind: 'video',
      originalPath: 'source/house_fire_video.mp4', runtimePath: 'seed/initial-conditions.mp4', posterPath: 'seed/initial-conditions-poster.webp',
      mimeType: 'video/mp4', byteSize: 6098089, width: 1920, height: 1080, sha256: '17f2c016395947e8777844a7d55f36eed01f358dacfac2b1ca6f3cf95f3d148c', createdAt: now,
    },
  ],
  archived: false,
  createdAt: now,
  updatedAt: now,
}
