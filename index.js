/**
 * Host half of the Agnes media bundle.
 *
 * The plugin owns four composer commands that turn a prompt — and, for the
 * editing modes, one attached image — into an image or a video produced by the
 * Agnes AI API. It keeps the API key, the endpoint region and the current
 * generation options in the credential store, so neither the key nor a
 * preference ever lives in the profile patch, and it never logs the key.
 *
 * The Client half of this package adds the mode picker above the composer, the
 * style and size row below it, and the settings card that writes the
 * credential, the region and the options.
 */

import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Credential reference that holds the Agnes API key. */
export const API_KEY_REF = 'AGNES_API_KEY'

/** Credential reference that holds the endpoint region. */
export const REGION_REF = 'AGNES_REGION'

/** Credential reference that holds the generation options as one JSON object. */
export const OPTIONS_REF = 'AGNES_MEDIA_OPTIONS'

/** Endpoint regions this plugin can talk to. */
export const REGIONS = {
  cn: { id: 'cn', baseUrl: 'https://apihub.agnes-ai.cn/v1', origin: 'https://apihub.agnes-ai.cn' },
  intl: { id: 'intl', baseUrl: 'https://apihub.agnes-ai.com/v1', origin: 'https://apihub.agnes-ai.com' },
}

/** Media models this plugin drives. */
export const MODELS = {
  image: 'agnes-image-2.5-flash',
  video: 'agnes-video-2.5-flash',
}

/** Text model that rewrites a short description into a detailed prompt. */
export const TEXT_MODEL = 'agnes-3.0-flash'

/** Name of the command that enhances a prompt with the text model. */
export const PROMPT_COMMAND = 'agnes-prompt'

/**
 * Style presets, keyed by the id the Client writes into the options.
 *
 * The phrase is appended to the prompt, because the image and video models
 * follow the prompt far better than they follow a separate parameter.
 */
export const STYLE_PHRASES = {
  none: '',
  cartoon: 'cartoon style, bold clean outlines, flat vibrant colors',
  anime: 'anime illustration, expressive eyes, detailed cel shading',
  sketch: 'pencil sketch, monochrome line art, cross hatching, hand drawn',
  realistic: 'photorealistic, natural light, fine texture, sharp focus',
  render3d: '3D render, soft global illumination, subsurface scattering',
  watercolor: 'watercolor painting, soft washes, paper grain, bleeding pigment',
  oil: 'oil painting, visible brush strokes, canvas texture, rich impasto',
  cyberpunk: 'cyberpunk aesthetic, neon light, wet reflective street',
  pixel: 'pixel art, 16 bit retro game sprite, limited palette',
  cinematic: 'cinematic film still, anamorphic lens, dramatic rim light',
}

/** Output tiers the image model accepts. */
export const IMAGE_SIZES = ['1K', '2K', '3K', '4K']

/** Aspect ratios both models accept. */
export const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']

/** Video lengths the video model accepts, in seconds. */
export const VIDEO_SECONDS = ['4', '5', '8', '12']

/** Default output tier of a generated image. */
const DEFAULT_IMAGE_SIZE = '2K'

/** Default length of a generated video, in seconds. */
const DEFAULT_VIDEO_SECONDS = '5'

/** Default aspect ratio of a generated video. */
const DEFAULT_VIDEO_ASPECT = '16:9'

/** Longest a video task may run before the plugin gives up waiting. */
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000

/** Gap between two video task polls. */
const VIDEO_POLL_INTERVAL_MS = 2000

/**
 * The four composer modes, in the order the Client lists them.
 *
 * `command` is the slash command the mode runs; `needsImage` marks the modes
 * that consume one attached image.
 */
export const MODES = [
  {
    id: 'text2image',
    command: 'agnes-image',
    kind: 'image',
    needsImage: false,
    description: '文生图 · 用文字描述生成图片 (text to image)',
    hint: '描述你想生成的图片',
  },
  {
    id: 'image2image',
    command: 'agnes-image-edit',
    kind: 'image',
    needsImage: true,
    description: '图生图 · 按描述改写已附图片 (image to image)',
    hint: '描述你想如何修改已附的图片',
  },
  {
    id: 'text2video',
    command: 'agnes-video',
    kind: 'video',
    needsImage: false,
    description: '文生视频 · 用文字描述生成视频 (text to video)',
    hint: '描述你想生成的视频',
  },
  {
    id: 'image2video',
    command: 'agnes-video-image',
    kind: 'video',
    needsImage: true,
    description: '图生视频 · 用已附图片生成视频 (image to video)',
    hint: '描述你想让已附图片如何动起来',
  },
]

/**
 * Read one credential reference without throwing when the store is absent.
 *
 * @param {object} ctx - the plugin context.
 * @param {string} ref - the credential reference to read.
 * @returns {Promise<string | undefined>} the stored value, or undefined.
 */
async function readCredential(ctx, ref) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return undefined
  try {
    const resolved = await credentials.resolve(ref)
    if (resolved === undefined) return undefined
    const value = typeof resolved === 'string' ? resolved : resolved.value
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Pick one value from an allowed list, falling back to the default.
 *
 * @param {unknown} value - the candidate value.
 * @param {readonly string[]} allowed - the accepted values.
 * @param {string} fallback - the value used when the candidate is unusable.
 * @returns {string} the accepted value.
 */
function pick(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

/**
 * Perform one JSON request against the Agnes API.
 *
 * @param {string} url - absolute request URL.
 * @param {object} init - fetch init, without headers.
 * @param {string} key - the API key sent as a bearer token.
 * @param {AbortSignal} [signal] - cancellation signal.
 * @returns {Promise<any>} the parsed response body.
 */
async function requestJson(url, init, key, signal) {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let body
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.detail ?? body?.message ?? text ?? response.statusText
    throw new Error(`Agnes API ${response.status}: ${String(detail).slice(0, 400)}`)
  }
  return body
}

/**
 * Download one remote artifact into bytes.
 *
 * @param {string} url - the artifact URL.
 * @param {AbortSignal} [signal] - cancellation signal.
 * @returns {Promise<Uint8Array>} the downloaded bytes.
 */
async function download(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Agnes download failed with HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Wait for a fixed number of milliseconds.
 *
 * @param {number} ms - the delay.
 * @param {AbortSignal} [signal] - cancellation signal.
 * @returns {Promise<void>} resolves after the delay.
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Name of the folder generated artifacts are written into, relative to the
 * session's working directory.
 */
export const OUTPUT_DIR = 'agnes-output'

/** Name of the manifest that records every generated artifact. */
export const MANIFEST_NAME = 'index.jsonl'

/** HTTP prefix that serves one generated asset to the browser. */
export const ASSET_PREFIX = '/agnes-media/asset'

/** Media types the asset route may serve. */
const ASSET_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
}

/** How many manifest entries to retain. */
const MANIFEST_LIMIT = 200

/**
 * Resolve the directory a generated artifact is written into.
 *
 * The session's working directory is preferred, so a generated file lands next
 * to the work the user is doing; the process directory is the fallback.
 *
 * @param {object} [agent] - the receiving agent.
 * @returns {string} an absolute directory path.
 */
function resolveOutputDir(agent) {
  const candidates = []
  try {
    candidates.push(agent?.session?.header?.cwd)
  } catch {}
  try {
    candidates.push(agent?.session?.getSnapshot?.()?.cwd)
  } catch {}
  try {
    candidates.push(agent?.cwd)
  } catch {}
  const cwd = candidates.find((value) => typeof value === 'string' && value.length > 0)
  return join(cwd ?? process.cwd(), OUTPUT_DIR)
}

/**
 * Write one artifact into the output directory.
 *
 * @param {string} dir - the absolute output directory.
 * @param {string} stem - the file name without extension.
 * @param {Uint8Array} bytes - the artifact bytes.
 * @param {string} extension - the file extension.
 * @returns {Promise<{name: string, path: string}>} the written file.
 */
async function writeArtifact(dir, stem, bytes, extension) {
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `${stem}-${stamp}.${extension}`
  const path = join(dir, name)
  await writeFile(path, bytes)
  return { name, path }
}

/**
 * Record one artifact in the gallery manifest, newest first.
 *
 * The manifest is what the browser reads to list generated assets: it carries
 * the public URL, so a thumbnail never has to cross the wire as bytes.
 *
 * @param {string} dir - the absolute output directory.
 * @param {object} entry - the manifest entry.
 * @returns {Promise<void>} completion.
 */
async function recordArtifact(dir, entry) {
  const manifest = join(dir, MANIFEST_NAME)
  let lines = []
  try {
    const raw = await readFile(manifest, 'utf8')
    lines = raw.split('\n').filter((line) => line.trim().length > 0)
  } catch {}
  const next = [JSON.stringify(entry), ...lines].slice(0, MANIFEST_LIMIT)
  try {
    await writeFile(manifest, next.join('\n') + '\n')
  } catch {}
}

/**
 * Whether one requested path may be served by the asset route.
 *
 * Only files inside an `agnes-output` folder are served, and only media types
 * this plugin writes, so the route can never expose an arbitrary file.
 *
 * @param {string} path - the requested absolute path.
 * @returns {boolean} whether the path is servable.
 */
function isServableAsset(path) {
  if (typeof path !== 'string' || path.length === 0) return false
  if (/(^|[\\/])\.\.([\\/]|$)/.test(path)) return false
  if (!/[\\/]agnes-output[\\/]/i.test(path)) return false
  return assetType(path) !== undefined
}

/**
 * The media type of one generated file.
 *
 * @param {string} path - the file name or path.
 * @returns {string | undefined} the media type, or undefined when unsupported.
 */
function assetType(path) {
  const match = /\.([a-z0-9]+)$/i.exec(path)
  if (match === null) return undefined
  return ASSET_TYPES[match[1].toLowerCase()]
}

/**
 * Register the HTTP route that streams one generated asset to the browser.
 *
 * The gallery renders thumbnails and previews straight from this route, so an
 * image never has to cross the remote RPC boundary as bytes. The caller passes
 * a context that already holds the `webServer` service.
 *
 * @param {object} ctx - a context carrying `webServer`.
 */
function registerAssetRoute(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ASSET_PREFIX,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.end()
        return
      }
      const url = new URL(String(req.url), 'http://localhost')
      const target = url.searchParams.get('path') ?? ''
      if (!isServableAsset(target)) {
        res.statusCode = 403
        res.end()
        return
      }
      const connection = ctx.get('connection')
      const rejection = connection?.requestRejection?.(req)
      if (typeof rejection === 'number') {
        res.statusCode = rejection
        res.end()
        return
      }
      let info
      try {
        info = await stat(target)
      } catch {
        res.statusCode = 404
        res.end()
        return
      }
      if (!info.isFile()) {
        res.statusCode = 404
        res.end()
        return
      }
      const type = assetType(target)
      res.setHeader('content-type', type)
      res.setHeader('cache-control', 'private, max-age=3600')
      res.setHeader('accept-ranges', 'bytes')
      const asked = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
      if (asked === null) {
        let body
        try {
          body = await readFile(target)
        } catch {
          res.statusCode = 500
          res.end()
          return
        }
        res.statusCode = 200
        res.setHeader('content-length', String(body.length))
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        res.end(body)
        return
      }
      const start = asked[1] === '' ? 0 : Number(asked[1])
      const end = asked[2] === '' ? info.size - 1 : Math.min(Number(asked[2]), info.size - 1)
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
        res.statusCode = 416
        res.setHeader('content-range', `bytes */${info.size}`)
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`)
      res.setHeader('content-length', String(end - start + 1))
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      await new Promise((resolve) => {
        const chunks = []
        const stream = createReadStream(target, { start, end })
        stream.on('data', (chunk) => chunks.push(chunk))
        stream.on('error', () => { res.statusCode = 500; res.end(); resolve() })
        stream.on('end', () => { res.end(Buffer.concat(chunks)); resolve() })
      })
    },
  }), `agnes-media: GET ${ASSET_PREFIX}`)
}

/**
 * The Agnes media client.
 *
 * One instance owns the credential lookups and both generation flows; the
 * composer commands call it and nothing else talks to the API.
 */
class AgnesMedia {
  /**
   * @param {object} ctx - the plugin context.
   */
  constructor(ctx) {
    this.ctx = ctx
  }

  /**
   * Read the API key and the endpoint region.
   *
   * The region falls back to the international gateway, which is the one the
   * shipped `agnes` provider configuration uses; the Client writes the
   * explicit choice into the credential store.
   *
   * @returns {Promise<{key: string | undefined, region: object}>} the resolved settings.
   */
  async settings() {
    const [key, regionId] = await Promise.all([
      readCredential(this.ctx, API_KEY_REF),
      readCredential(this.ctx, REGION_REF),
    ])
    const region = REGIONS[regionId ?? 'intl'] ?? REGIONS.intl
    return { key, region }
  }

  /**
   * Read the generation options the Client wrote.
   *
   * @returns {Promise<{style: string, size: string, ratio: string, seconds: string, textModel: string}>} the options.
   */
  async options() {
    const raw = await readCredential(this.ctx, OPTIONS_REF)
    let parsed = {}
    if (raw !== undefined) {
      try {
        const value = JSON.parse(raw)
        if (value !== null && typeof value === 'object') parsed = value
      } catch {}
    }
    return {
      style: pick(parsed.style, Object.keys(STYLE_PHRASES), 'none'),
      size: pick(parsed.size, IMAGE_SIZES, DEFAULT_IMAGE_SIZE),
      ratio: pick(parsed.ratio, RATIOS, DEFAULT_VIDEO_ASPECT),
      seconds: pick(parsed.seconds, VIDEO_SECONDS, DEFAULT_VIDEO_SECONDS),
      textModel: typeof parsed.textModel === 'string' && parsed.textModel.length > 0 ? parsed.textModel : TEXT_MODEL,
    }
  }

  /**
   * Rewrite a short description into a detailed generation prompt.
   *
   * @param {object} request - the enhancement request.
   * @param {string} request.prompt - the user's description.
   * @param {AbortSignal} [request.signal] - cancellation signal.
   * @returns {Promise<string>} the enhanced prompt.
   */
  async enhance({ prompt, signal }) {
    const [{ key, region }, options] = await Promise.all([this.settings(), this.options()])
    if (key === undefined) {
      throw new Error('Agnes API key is not configured. Set it in Plugins → Agnes media first.')
    }
    const body = {
      model: options.textModel,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: [
            'You rewrite a short user description into one detailed prompt for an image or video generation model.',
            'Cover the subject, the scene, the style, the lighting, the composition and the level of detail.',
            'Keep the user\'s language and never invent a product, a person or a brand that was not described.',
            'Answer with the finished prompt only: no preamble, no notes, no quotation marks.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    }
    const payload = await requestJson(`${region.baseUrl}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, key, signal)
    const text = payload?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Agnes returned no enhanced prompt.')
    }
    return text.trim()
  }

  /**
   * Read every attached image as a data URI.
   *
   * @param {readonly {type: string, attachment: object}[]} attachments - the admitted command attachments.
   * @returns {Promise<string[]>} one data URI per attached image.
   */
  async attachmentDataUris(attachments) {
    const store = this.ctx.get('attachments')
    const images = (attachments ?? []).filter((entry) => entry?.type === 'image')
    if (images.length === 0) return []
    if (store === undefined) throw new Error('The attachment store is not composed, so the attached image cannot be read.')
    const uris = []
    for (const image of images) {
      const stored = await store.readImage(image.attachment)
      const mediaType = stored.ref.mediaType ?? 'image/png'
      uris.push(`data:${mediaType};base64,${Buffer.from(stored.data).toString('base64')}`)
    }
    return uris
  }

  /**
   * Generate one image.
   *
   * @param {object} request - the generation request.
   * @param {string} request.prompt - the text prompt, style included.
   * @param {string[]} [request.images] - data URIs of the input images.
   * @param {object} request.options - the resolved generation options.
   * @param {string} request.key - the API key.
   * @param {object} request.region - the endpoint region.
   * @param {AbortSignal} [request.signal] - cancellation signal.
   * @returns {Promise<{bytes: Uint8Array, mime: string, url: string | undefined}>} the generated image.
   */
  async image({ prompt, images = [], options, key, region, signal }) {
    const body = {
      model: MODELS.image,
      prompt,
      size: options.size,
      ratio: options.ratio,
      extra_body: { response_format: 'url' },
    }
    if (images.length > 0) body.extra_body.image = images
    const payload = await requestJson(`${region.baseUrl}/images/generations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, key, signal)
    const item = payload?.data?.[0]
    if (item === undefined) throw new Error('Agnes API returned no image data.')
    if (typeof item.url === 'string' && item.url.length > 0) {
      return { bytes: await download(item.url, signal), mime: 'image/png', url: item.url }
    }
    if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
      return { bytes: new Uint8Array(Buffer.from(item.b64_json, 'base64')), mime: 'image/png', url: undefined }
    }
    throw new Error('Agnes API returned neither an image URL nor image bytes.')
  }

  /**
   * Generate one video and wait for the task to finish.
   *
   * @param {object} request - the generation request.
   * @param {string} request.prompt - the text prompt, style included.
   * @param {string[]} [request.images] - data URIs of the reference images.
   * @param {object} request.options - the resolved generation options.
   * @param {string} request.key - the API key.
   * @param {object} request.region - the endpoint region.
   * @param {AbortSignal} [request.signal] - cancellation signal.
   * @returns {Promise<{bytes: Uint8Array, mime: string, url: string | undefined}>} the generated video.
   */
  async video({ prompt, images = [], options, key, region, signal }) {
    const body = {
      model: MODELS.video,
      prompt,
      mode: images.length > 0 ? 'reference' : 'text',
      seconds: options.seconds,
      size: '720P',
      aspect_ratio: options.ratio,
    }
    if (images.length > 0) body.images = images
    const created = await requestJson(`${region.baseUrl}/videos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, key, signal)
    const taskId = created?.video_id ?? created?.id ?? created?.task_id
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new Error('Agnes API accepted the video request but returned no task id.')
    }
    const url = await this.waitForVideo(taskId, key, region, signal)
    return { bytes: await download(url, signal), mime: 'video/mp4', url, taskId }
  }

  /**
   * Poll one video task until it completes.
   *
   * @param {string} taskId - the task id.
   * @param {string} key - the API key.
   * @param {object} region - the endpoint region.
   * @param {AbortSignal} [signal] - cancellation signal.
   * @returns {Promise<string>} the URL of the finished video.
   */
  async waitForVideo(taskId, key, region, signal) {
    const deadline = Date.now() + VIDEO_TIMEOUT_MS
    const query = `video_id=${encodeURIComponent(taskId)}&model_name=${encodeURIComponent(MODELS.video)}`
    while (Date.now() < deadline) {
      await delay(VIDEO_POLL_INTERVAL_MS, signal)
      let status
      try {
        status = await requestJson(`${region.origin}/agnesapi?${query}`, { method: 'GET' }, key, signal)
      } catch (error) {
        try {
          status = await requestJson(`${region.baseUrl}/videos/${encodeURIComponent(taskId)}`, { method: 'GET' }, key, signal)
        } catch {
          throw error
        }
      }
      const state = status?.status
      if (state === 'completed') {
        const url = status?.url
        if (typeof url !== 'string' || url.length === 0) throw new Error('Agnes API completed the video task without a URL.')
        return url
      }
      if (state === 'failed') {
        const detail = status?.error?.message ?? status?.error ?? 'the task failed'
        throw new Error(`Agnes video task failed: ${String(detail).slice(0, 300)}`)
      }
    }
    throw new Error('Agnes video generation timed out.')
  }

  /**
   * Run one generation request end to end.
   *
   * @param {object} request - the generation request.
   * @param {string} request.prompt - the user's prompt, without the style.
   * @param {string[]} [request.images] - data URIs of the input images.
   * @param {'image' | 'video'} request.kind - the artifact kind.
   * @param {string} [request.mode] - the composer mode that produced it.
   * @param {AbortSignal} [request.signal] - cancellation signal.
   * @param {object} [agent] - the receiving agent.
   * @returns {Promise<{bytes: Uint8Array, mime: string, url: string | undefined, path: string, name: string, dir: string, options: object, prompt: string}>} the artifact.
   */
  async generate({ prompt, images = [], kind, mode, signal, agent }) {
    const [{ key, region }, options] = await Promise.all([this.settings(), this.options()])
    if (key === undefined) {
      throw new Error('Agnes API key is not configured. Set it in Plugins → Agnes media first.')
    }
    const stylePhrase = STYLE_PHRASES[options.style] ?? ''
    const fullPrompt = stylePhrase.length === 0 ? prompt : `${prompt}, ${stylePhrase}`
    const artifact = kind === 'video'
      ? await this.video({ prompt: fullPrompt, images, options, key, region, signal })
      : await this.image({ prompt: fullPrompt, images, options, key, region, signal })
    const extension = kind === 'video' ? 'mp4' : 'png'
    const dir = resolveOutputDir(agent)
    const written = await writeArtifact(dir, kind === 'video' ? 'agnes-video' : 'agnes-image', artifact.bytes, extension)
    await recordArtifact(dir, {
      name: written.name,
      kind,
      mode: mode ?? null,
      prompt,
      finalPrompt: fullPrompt,
      style: options.style,
      stylePhrase,
      size: options.size,
      ratio: options.ratio,
      seconds: options.seconds,
      model: kind === 'video' ? MODELS.video : MODELS.image,
      region: region.id,
      references: images.length,
      mime: artifact.mime,
      bytes: artifact.bytes.length,
      url: artifact.url ?? null,
      taskId: artifact.taskId ?? null,
      createdAt: new Date().toISOString(),
    })
    return { ...artifact, path: written.path, name: written.name, dir, options, prompt: fullPrompt }
  }
}

/**
 * Required Host services.
 *
 * The command registry is required; the credential and attachment stores are
 * optional and are read through `ctx.get`, so the plugin still activates in a
 * composition that lacks them and reports the missing piece on first use.
 */
export const inject = ['commands']

/**
 * Register the four Agnes media commands.
 *
 * The result text carries a human-readable first line and, on success, one
 * JSON line with the artifact metadata. The composer never echoes a command
 * result, so the Client reads that JSON to show the image and the saved path.
 *
 * @param {object} ctx - the plugin context.
 */
export function apply(ctx) {
  const media = new AgnesMedia(ctx)
  // The asset route needs the HTTP server; it is registered as soon as that
  // service exists, so a Host without one still runs the commands below.
  ctx.inject(['webServer'], (scope) => {
    registerAssetRoute(scope)
  })
  for (const mode of MODES) {
    ctx.effect(() => {
      const dispose = ctx.commands.register({
        name: mode.command,
        description: mode.description,
        input: { hint: mode.hint, attachments: true },
        handler: async ({ rawInput, attachments, signal, agent }) => {
          const prompt = (rawInput ?? '').trim()
          if (prompt.length === 0) {
            return { kind: 'error', text: `/${mode.command}: describe what you want to generate.` }
          }
          const images = mode.needsImage ? await media.attachmentDataUris(attachments) : []
          if (mode.needsImage && images.length === 0) {
            return { kind: 'error', text: `/${mode.command}: attach one image to edit.` }
          }
          try {
            const artifact = await media.generate({ prompt, images, kind: mode.kind, mode: mode.id, signal, agent })
            const summary = mode.kind === 'video'
              ? `视频已生成 · ${artifact.options.seconds}s · ${artifact.options.ratio}`
              : `图片已生成 · ${artifact.options.size} · ${artifact.options.ratio}`
            const payload = {
              kind: mode.kind,
              mode: mode.id,
              prompt,
              finalPrompt: artifact.prompt,
              name: artifact.name,
              url: artifact.url,
              path: artifact.path,
              dir: dirname(artifact.path),
              mime: artifact.mime,
              bytes: artifact.bytes.length,
              size: artifact.options.size,
              ratio: artifact.options.ratio,
              seconds: artifact.options.seconds,
              style: artifact.options.style,
            }
            return { kind: 'success', text: `${summary}\n${JSON.stringify(payload)}` }
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            return { kind: 'error', text: `生成失败：${reason}` }
          }
        },
      })
      return () => dispose()
    }, `agnes-media: /${mode.command}`)
  }

  // The prompt enhancer answers the Client directly: the browser calls this
  // command and replaces the draft with the rewritten description.
  ctx.effect(() => {
    const dispose = ctx.commands.register({
      name: PROMPT_COMMAND,
      description: '增强提示词 · 用 Agnes 文本模型润色描述',
      input: { hint: '要增强的描述' },
      handler: async ({ rawInput, signal }) => {
        const prompt = (rawInput ?? '').trim()
        if (prompt.length === 0) {
          return { kind: 'error', text: `/${PROMPT_COMMAND}: 先写一句要增强的描述。` }
        }
        try {
          return { kind: 'success', text: await media.enhance({ prompt, signal }) }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return { kind: 'error', text: `增强失败：${reason}` }
        }
      },
    })
    return () => dispose()
  }, `agnes-media: /${PROMPT_COMMAND}`)
}
