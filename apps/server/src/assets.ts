import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { MultipartFile } from '@fastify/multipart'
import type { ScenarioAssetRecord } from './model.js'

const acceptedImageTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
])

function safePath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relativePath)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Unsafe asset path')
  return resolved
}

export async function processScenarioImage(
  file: MultipartFile,
  scenarioId: string,
  storageRoot: string,
): Promise<ScenarioAssetRecord> {
  const extension = acceptedImageTypes.get(file.mimetype)
  if (!extension) throw new Error('Only PNG, JPEG, and WebP scenario images are accepted.')
  const bytes = await file.toBuffer()
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('Scenario image exceeds the 50 MB limit.')
  const image = sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions could not be read.')

  const digest = createHash('sha256').update(bytes).digest('hex')
  const id = randomUUID()
  const originalRelative = `scenarios/${scenarioId}/original/${id}${extension}`
  const runtimeRelative = `scenarios/${scenarioId}/runtime/${id}.webp`
  const thumbnailRelative = `scenarios/${scenarioId}/thumb/${id}.webp`
  await Promise.all([
    mkdir(path.dirname(safePath(storageRoot, originalRelative)), { recursive: true }),
    mkdir(path.dirname(safePath(storageRoot, runtimeRelative)), { recursive: true }),
    mkdir(path.dirname(safePath(storageRoot, thumbnailRelative)), { recursive: true }),
  ])
  await writeFile(safePath(storageRoot, originalRelative), bytes, { flag: 'wx' })
  await sharp(bytes).rotate().withMetadata({ orientation: undefined }).webp({ quality: 92, smartSubsample: true }).toFile(safePath(storageRoot, runtimeRelative))
  await sharp(bytes).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(safePath(storageRoot, thumbnailRelative))

  return {
    id,
    scenarioId,
    kind: 'background',
    originalPath: originalRelative,
    runtimePath: runtimeRelative,
    thumbnailPath: thumbnailRelative,
    mimeType: 'image/webp',
    byteSize: bytes.byteLength,
    width: metadata.width,
    height: metadata.height,
    sha256: digest,
    createdAt: new Date().toISOString(),
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed: ${stderr.slice(-800)}`)))
  })
}

export async function processScenarioVideo(file: MultipartFile, scenarioId: string, storageRoot: string): Promise<ScenarioAssetRecord> {
  if (file.mimetype !== 'video/mp4') throw new Error('Only MP4 scenario video is accepted.')
  const bytes = await file.toBuffer()
  if (bytes.byteLength > 200 * 1024 * 1024) throw new Error('Scenario video exceeds the 200 MB limit.')
  if (bytes.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('The uploaded file is not a valid MP4 container.')

  const id = randomUUID()
  const originalRelative = `scenarios/${scenarioId}/original/${id}.mp4`
  const runtimeRelative = `scenarios/${scenarioId}/runtime/${id}.mp4`
  const posterRelative = `scenarios/${scenarioId}/poster/${id}.webp`
  const originalPath = safePath(storageRoot, originalRelative)
  const runtimePath = safePath(storageRoot, runtimeRelative)
  const posterPath = safePath(storageRoot, posterRelative)
  await Promise.all([originalPath, runtimePath, posterPath].map((target) => mkdir(path.dirname(target), { recursive: true })))
  await writeFile(originalPath, bytes, { flag: 'wx' })
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', originalPath, '-map_metadata', '0', '-vf', "scale='min(1920,iw)':-2,format=yuv420p", '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', '-an', runtimePath])
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '00:00:03', '-i', runtimePath, '-frames:v', '1', '-vf', 'scale=960:-2', posterPath])
    const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', runtimePath])) as { streams?: Array<{ width?: number; height?: number }> }
    const stream = probe.streams?.[0]
    const runtimeBytes = await readFile(runtimePath)
    return {
      id, scenarioId, kind: 'video', originalPath: originalRelative, runtimePath: runtimeRelative, posterPath: posterRelative,
      mimeType: 'video/mp4', byteSize: runtimeBytes.byteLength, ...(stream?.width ? { width: stream.width } : {}), ...(stream?.height ? { height: stream.height } : {}),
      sha256: createHash('sha256').update(runtimeBytes).digest('hex'), createdAt: new Date().toISOString(),
    }
  } catch (error) {
    await Promise.allSettled([runtimePath, posterPath].map((target) => rm(target, { force: true })))
    throw error
  }
}
