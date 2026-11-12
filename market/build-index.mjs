/**
 * Build the format-1 plugin market index for this bundle.
 *
 * The index points at one exact commit of this repository, so an install is
 * reproducible and the market can show compatibility without guessing.
 *
 * Usage: node market/build-index.mjs
 */

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = async (path) => readFile(join(root, path), 'utf8')

/** Repository URL the index installs from, without a trailing `.git`. */
const REPOSITORY = 'https://cnb.cool/quanzaiyu/quanzaiyu/agnes-media'

/** DSH versions this build was verified against. */
const DSH_RANGE = '>=0.2.2-rc.1'

const manifest = JSON.parse(await read('package.json'))
const zh = JSON.parse(await read('locale/zh.json'))
const en = JSON.parse(await read('locale/en.json'))
const icon = (await read('icon.svg')).trim()
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

const index = {
  format: 1,
  title: { en: 'Agnes media', zh: 'Agnes 媒体生成' },
  description: {
    en: 'Image and video generation inside the DSH composer, driven by the free Agnes AI models.',
    zh: '在 DSH 输入框里直接调用 Agnes 免费模型生成图片与视频。',
  },
  metadata: {
    categories: {
      media: { title: { en: 'Media generation', zh: '媒体生成' } },
    },
    labels: {
      image: { title: { en: 'Image', zh: '图片' } },
      video: { title: { en: 'Video', zh: '视频' } },
      agnes: { title: { en: 'Agnes AI', zh: 'Agnes AI' } },
      free: { title: { en: 'Free tier', zh: '免费额度' } },
    },
    sortKeys: {},
  },
  plugins: [
    {
      name: manifest.name,
      title: { en: en.meta.title, zh: zh.meta.title },
      description: { en: en.meta.description, zh: zh.meta.description },
      author: 'quanzaiyu',
      homepage: REPOSITORY,
      repository: { url: REPOSITORY },
      icon: `data:image/svg+xml;base64,${Buffer.from(icon, 'utf8').toString('base64')}`,
      metadata: {
        category: 'media',
        keywords: ['agnes', 'agnes-ai', 'image', 'video', 'text-to-image', 'text-to-video', 'dsh-plugin'],
        labels: ['image', 'video', 'agnes', 'free'],
        sortKeys: {},
      },
      versions: [
        {
          version: manifest.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'git', url: REPOSITORY, commit },
          engines: { dsh: DSH_RANGE },
        },
      ],
    },
  ],
}

const target = join(root, 'market', 'index.json')
await writeFile(target, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`wrote ${target} for ${manifest.name}@${manifest.version} at ${commit}`)
