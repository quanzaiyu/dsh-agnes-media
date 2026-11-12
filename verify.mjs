/**
 * Local verification harness for the Host half of the Agnes media bundle.
 *
 * It mounts the plugin against fake Cordis services, stubs the Agnes API, and
 * asserts that every mode registers, calls the documented endpoint, applies the
 * chosen style and size, and writes its artifact. It is a development aid and
 * is not part of the bundle.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'

const workdir = await mkdtemp(join(tmpdir(), 'agnes-media-verify-'))
const registered = new Map()
const requests = []

let credentials = {
  AGNES_API_KEY: 'sk-test-key',
  AGNES_REGION: 'cn',
  AGNES_MEDIA_OPTIONS: JSON.stringify({ style: 'cartoon', size: '2K', ratio: '16:9', seconds: '5' }),
}

const fakeAttachments = {
  async readImage(ref) {
    return { ref, data: new Uint8Array([1, 2, 3, 4]) }
  },
}

let assetRoute
const fakeWebServer = {
  register(route) {
    assetRoute = route
    return () => { assetRoute = undefined }
  },
}

const ctx = {
  disposers: [],
  webServer: fakeWebServer,
  effect(run) {
    const dispose = run()
    if (typeof dispose === 'function') this.disposers.push(dispose)
  },
  inject(deps, callback) {
    if (deps.every((dep) => this.get(dep) !== undefined)) callback(this)
  },
  commands: {
    register(definition) {
      if (registered.has(definition.name)) throw new Error(`duplicate command ${definition.name}`)
      registered.set(definition.name, definition)
      return () => registered.delete(definition.name)
    },
  },
  get(name) {
    if (name === 'credentials') {
      return {
        async resolve(ref) {
          const value = credentials[ref]
          return value === undefined ? undefined : { value, source: 'store' }
        },
      }
    }
    if (name === 'attachments') return fakeAttachments
    if (name === 'webServer') return fakeWebServer
    return undefined
  },
}

const responses = []
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init })
  const next = responses.shift()
  if (next === undefined) throw new Error(`unexpected request to ${url}`)
  return {
    ok: next.status === undefined || next.status < 400,
    status: next.status ?? 200,
    statusText: 'OK',
    async text() {
      return next.body === undefined ? '' : JSON.stringify(next.body)
    },
    async arrayBuffer() {
      return new Uint8Array([9, 8, 7, 6, 5]).buffer
    },
  }
}

const { apply, MODES } = await import('./index.js')
apply(ctx)

const failures = []
const check = (label, condition, detail) => {
  if (condition) console.log(`  ok  ${label}`)
  else {
    console.log(`FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
    failures.push(label)
  }
}
const body = (index) => JSON.parse(requests.at(index).init.body)
const payloadOf = (text) => {
  const lines = String(text ?? '').split('\n')
  const last = lines[lines.length - 1]
  return last.startsWith('{') ? JSON.parse(last) : undefined
}

console.log('registration')
check('five commands registered', registered.size === 5, `got ${registered.size}`)
check('the prompt enhancer is registered', registered.has('agnes-prompt'))
for (const mode of MODES) {
  const definition = registered.get(mode.command)
  check(`/${mode.command} accepts attachments`, definition?.input?.attachments === true)
  check(`/${mode.command} has a description`, typeof definition?.description === 'string' && definition.description.length > 0)
}

console.log('text to image')
responses.push({ body: { created: 1, data: [{ url: 'https://example.com/image.png' }] } })
responses.push({ body: undefined })
let result = await registered.get('agnes-image').handler({
  rawInput: '一只戴帽子的猫',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('image request hit the images endpoint', requests.at(-2)?.url === 'https://apihub.agnes-ai.cn/v1/images/generations', requests.at(-2)?.url)
check('image request used the image model', body(-2).model === 'agnes-image-2.5-flash')
check('image request asked for a url', body(-2).extra_body?.response_format === 'url')
check('image request carried the chosen size', body(-2).size === '2K', body(-2).size)
check('image request carried the chosen ratio', body(-2).ratio === '16:9', body(-2).ratio)
check('image prompt carries the style phrase', body(-2).prompt.includes('cartoon style'), body(-2).prompt)
check('image prompt keeps the user text', body(-2).prompt.startsWith('一只戴帽子的猫'))
check('image command succeeded', result.kind === 'success', JSON.stringify(result))
const imagePayload = payloadOf(result.text)
check('result carries the public url', imagePayload?.url === 'https://example.com/image.png', JSON.stringify(imagePayload))
check('result carries the saved path', typeof imagePayload?.path === 'string' && imagePayload.path.includes('agnes-output'))
check('result carries the folder', imagePayload?.dir === imagePayload?.path.replace(/[^\\/]+$/, '').replace(/[\\/]$/, ''), imagePayload?.dir)
check('result carries the mode id', imagePayload?.mode === 'text2image', imagePayload?.mode)
check('result has a readable first line', String(result.text).split('\n')[0].startsWith('图片已生成'), String(result.text).split('\n')[0])
check('image file exists', await readFile(imagePayload.path).then(() => true, () => false), imagePayload.path)
check('result carries the file name', imagePayload?.name === imagePayload?.path.replace(/^.*[\\/]/, ''), imagePayload?.name)
const manifest = await readFile(join(workdir, 'agnes-output', 'index.jsonl'), 'utf8').then((text) => text, () => '')
const manifestEntry = manifest.split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))[0]
check('manifest recorded the artifact', manifestEntry?.name === imagePayload?.name, manifestEntry?.name)
check('manifest carries the public url', manifestEntry?.url === 'https://example.com/image.png', manifestEntry?.url)
check('manifest carries the metadata', manifestEntry?.size === '2K' && manifestEntry?.ratio === '16:9' && manifestEntry?.kind === 'image', JSON.stringify(manifestEntry))
check('manifest carries the prompt', manifestEntry?.prompt === '一只戴帽子的猫', manifestEntry?.prompt)
check('manifest carries the final prompt', String(manifestEntry?.finalPrompt ?? '').includes('cartoon style'), manifestEntry?.finalPrompt)
check('manifest carries the mode and model', manifestEntry?.mode === 'text2image' && manifestEntry?.model === 'agnes-image-2.5-flash', JSON.stringify(manifestEntry))
check('manifest carries the region and reference count', manifestEntry?.region === 'cn' && manifestEntry?.references === 0, JSON.stringify(manifestEntry))

console.log('image to image')
responses.push({ body: { created: 2, data: [{ url: 'https://example.com/edit.png' }] } })
responses.push({ body: undefined })
result = await registered.get('agnes-image-edit').handler({
  rawInput: '改成夜景',
  attachments: [{ type: 'image', attachment: { attachmentId: 'a1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 } }],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('edit request carried the input image', Array.isArray(body(-2).extra_body?.image) && body(-2).extra_body.image.length === 1)
check('edit image is a data uri', String(body(-2).extra_body?.image?.[0]).startsWith('data:image/png;base64,'))
check('edit command succeeded', result.kind === 'success', JSON.stringify(result))

console.log('text to video')
credentials.AGNES_MEDIA_OPTIONS = JSON.stringify({ style: 'cinematic', size: '2K', ratio: '9:16', seconds: '8' })
responses.push({ body: { id: 'task_1', video_id: 'vid_1' } })
responses.push({ body: { status: 'completed', url: 'https://example.com/video.mp4' } })
responses.push({ body: undefined })
result = await registered.get('agnes-video').handler({
  rawInput: '雨后的街道',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('video request hit the videos endpoint', requests.at(-3)?.url === 'https://apihub.agnes-ai.cn/v1/videos', requests.at(-3)?.url)
check('video request used the video model', body(-3).model === 'agnes-video-2.5-flash')
check('video request used text mode', body(-3).mode === 'text')
check('video request carried the chosen length', body(-3).seconds === '8', body(-3).seconds)
check('video request carried the chosen ratio', body(-3).aspect_ratio === '9:16', body(-3).aspect_ratio)
check('video prompt carries the style phrase', body(-3).prompt.includes('cinematic film still'), body(-3).prompt)
check('video poll used the task endpoint', requests.at(-2)?.url?.startsWith('https://apihub.agnes-ai.cn/agnesapi?video_id=vid_1'), requests.at(-2)?.url)
check('video artifact was downloaded', requests.at(-1)?.url === 'https://example.com/video.mp4', requests.at(-1)?.url)
check('video command succeeded', result.kind === 'success', JSON.stringify(result))
const videoPayload = payloadOf(result.text)
check('video result carries the url', videoPayload?.url === 'https://example.com/video.mp4', JSON.stringify(videoPayload))
check('video file exists', await readFile(videoPayload.path).then(() => true, () => false), videoPayload.path)
const videoManifest = (await readFile(join(workdir, 'agnes-output', 'index.jsonl'), 'utf8'))
  .split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))
  .find((entry) => entry.name === videoPayload?.name)
check('video manifest carries the prompt and task', videoManifest?.prompt === '雨后的街道' && videoManifest?.taskId === 'vid_1', JSON.stringify(videoManifest))
check('video manifest carries the model and mode', videoManifest?.model === 'agnes-video-2.5-flash' && videoManifest?.mode === 'text2video', JSON.stringify(videoManifest))

console.log('region and failures')
credentials.AGNES_REGION = 'intl'
responses.push({ body: { data: [{ url: 'https://example.com/intl.png' }] } })
responses.push({ body: undefined })
await registered.get('agnes-image').handler({
  rawInput: '国际网关',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('international region used the international gateway', requests.at(-2)?.url === 'https://apihub.agnes-ai.com/v1/images/generations', requests.at(-2)?.url)

console.log('prompt enhancement')
credentials.AGNES_REGION = 'cn'
responses.push({
  body: { choices: [{ message: { role: 'assistant', content: 'a girl in a summer dress, soft daylight, 35mm photo' } }] },
})
result = await registered.get('agnes-prompt').handler({
  rawInput: '一个女孩',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('enhance request hit the chat endpoint', requests.at(-1)?.url === 'https://apihub.agnes-ai.cn/v1/chat/completions', requests.at(-1)?.url)
check('enhance request used the text model', body(-1).model === 'agnes-3.0-flash', body(-1).model)
check('enhance request carried the description', body(-1).messages.at(-1).content === '一个女孩')
check('enhance returned the rewritten prompt', result.kind === 'success' && result.text.includes('soft daylight'), JSON.stringify(result))
result = await registered.get('agnes-prompt').handler({
  rawInput: '  ',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('an empty description is refused', result.kind === 'error', JSON.stringify(result))

delete credentials.AGNES_API_KEY
result = await registered.get('agnes-image').handler({
  rawInput: '没有 key',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('missing key reports a readable error', result.kind === 'error' && result.text.includes('API key'), JSON.stringify(result))

result = await registered.get('agnes-image').handler({
  rawInput: '   ',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('empty prompt is refused', result.kind === 'error', JSON.stringify(result))

result = await registered.get('agnes-image-edit').handler({
  rawInput: '没有图片',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('image to image without an attachment is refused', result.kind === 'error', JSON.stringify(result))

credentials.AGNES_API_KEY = 'sk-test-key'
responses.push({ status: 401, body: { error: { message: 'invalid api key' } } })
result = await registered.get('agnes-image').handler({
  rawInput: '错误的 key',
  attachments: [],
  signal: undefined,
  agent: { session: { header: { cwd: workdir } } },
})
check('an api failure is reported, not swallowed', result.kind === 'error' && result.text.includes('401'), JSON.stringify(result))

console.log('asset route')
const makeRes = () => {
  const chunks = []
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback() } })
  res.statusCode = 200
  res.headers = {}
  res.setHeader = (key, value) => { res.headers[String(key).toLowerCase()] = value }
  res.body = () => Buffer.concat(chunks)
  return res
}
const callRoute = async (target, options = {}) => {
  const res = makeRes()
  await assetRoute.handler({
    url: '/agnes-media/asset?path=' + encodeURIComponent(target),
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
  }, res)
  return res
}

check('the asset route is registered', typeof assetRoute?.handler === 'function')
check('the asset route is a prefix route', assetRoute?.kind === 'prefix')
const outside = await callRoute(join(workdir, 'verify-agnes-media.mjs'))
check('a file outside agnes-output is refused', outside.statusCode === 403, String(outside.statusCode))
const traveller = await callRoute(`${workdir}\\agnes-output\\..\\secret.png`)
check('a traversal path is refused', traveller.statusCode === 403, String(traveller.statusCode))
const served = await callRoute(imagePayload.path)
check('a generated asset is served', served.statusCode === 200, String(served.statusCode))
check('the served asset has its media type', served.headers['content-type'] === 'image/png', served.headers['content-type'])
check('the served asset has bytes', served.body().length > 0, String(served.body().length))
const total = served.body().length
const ranged = await callRoute(imagePayload.path, { headers: { range: 'bytes=0-2' } })
check('a range request answers 206', ranged.statusCode === 206, String(ranged.statusCode))
check('the range is echoed', String(ranged.headers['content-range'] ?? '') === `bytes 0-2/${total}`, ranged.headers['content-range'])
check('the range body is three bytes', ranged.body().length === 3, String(ranged.body().length))

await rm(workdir, { recursive: true, force: true })
console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECK(S) FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
