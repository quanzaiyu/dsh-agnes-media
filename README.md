# Agnes 媒体生成 · DSH 插件

给 DeepSeek Harness 的 Web 输入框加上 **文生图 / 图生图 / 文生视频 / 图生视频** 四个模式，直接调用 Agnes AI 的免费图像与视频模型。

- 模式选择器就在「创造模式 / 标准模式」下拉框右侧，选项行在输入框上方
- 风格、尺寸、比例全部下拉框选择，不挤占输入区
- 生成结果落在工作区 `agnes-output/`，画册可随时回看
- 一键用本地默认程序 / 指定程序打开，或在资源管理器定位
- 用 Agnes 文本模型（`agnes-3.0-flash`）一键增强提示词

## 安装

已发布到 npm（`@quanzaiyu/dsh-agnes-media`），推荐直接按包名安装：

```
plugin_manager install_bundle target=@quanzaiyu/dsh-agnes-media
```

或安装本地目录：

```
plugin_manager install_bundle target=<本目录绝对路径>
```

或作为 profile bundle 手动加进 `cordis.patch.yml`：

```yaml
- insert:
    - id: agnes-media
      name: '@quanzaiyu/dsh-agnes-media'
```

安装后无需重启，Host 端会通过 HMR 装载。

## 配置 API Key

**插件页 → Agnes 媒体生成**：

| 项 | 说明 |
|---|---|
| Agnes API Key | 写入本机凭据存储 `AGNES_API_KEY`，不回传浏览器、不写配置文件 |
| 接口地址 | `AGNES_REGION` = `cn`（`https://apihub.agnes-ai.cn/v1`）或 `intl`（`https://apihub.agnes-ai.com/v1`） |

凭据通过 DSH 的 `ctx.credentials` 读写；若 profile 里已有同名的 Agnes Key（例如给 LLM provider 用的 `AGNES_API_KEY`），插件会直接复用，无需重复填写。

其余偏好（风格 / 尺寸 / 比例 / 时长）存在 `AGNES_MEDIA_OPTIONS`，浏览器本地另有镜像用于渲染当前选择。

## 使用

1. 输入框上方点「媒体生成」→ 选一个模式，输入框会填入对应斜杠命令
2. 补上描述，按回车或发送
3. 生成结果出现在输入框上方的结果卡，可预览、打开、去文件夹、再来一张

也可直接手打命令：

| 命令 | 模式 |
|---|---|
| `/agnes-image` | 文生图 |
| `/agnes-image-edit` | 图生图（需附图） |
| `/agnes-video` | 文生视频 |
| `/agnes-video-image` | 图生视频（需附图） |
| `/agnes-prompt` | 用文本模型增强提示词 |

## 生成资产

- 落盘位置：`<会话工作目录>/agnes-output/`
- 索引：同目录 `index.jsonl`，每条记录一次生成

```json
{
  "name": "agnes-image-2026-11-12T05-54-00-263Z.png",
  "kind": "image",
  "mode": "text2image",
  "prompt": "1girl",
  "finalPrompt": "1girl, cartoon style, bold clean outlines, vibrant colors",
  "style": "cartoon",
  "stylePhrase": "cartoon style, bold clean outlines, vibrant colors",
  "size": "2K",
  "ratio": "16:9",
  "seconds": "5",
  "model": "agnes-image-2.5-flash",
  "region": "cn",
  "references": 0,
  "mime": "image/png",
  "bytes": 5003005,
  "url": "https://platform-outputs.agnes-ai.space/...",
  "taskId": null,
  "createdAt": "2026-11-12T05:54:00.270Z"
}
```

画册（会话标题栏 / 首页模式按钮右侧 / 结果卡上的四宫格按钮）读取目录 + 清单渲染，缩略图优先用清单里的公共 URL，失败回退到本地 HTTP 路由。

## HTTP 资产路由

`GET /agnes-media/asset?path=<绝对路径>`

- 走 DSH 自身的鉴权栅栏（`connection.requestRejection`）
- 仅允许 `agnes-output` 目录内的 png/jpg/jpeg/webp/gif/mp4，拒绝 `..` 穿越
- 支持 `Range`（视频可拖进度条）

## 验证

```bash
node verify.mjs
```

覆盖：命令注册、文生图 / 图生图 / 文生视频的请求体与落盘、风格与尺寸参数、网关切换、提示词增强、清单字段，以及资产路由的 403 / 200 / 206。

## 已知限制

- 图生图 / 图生视频的参考图以 Data URI 传给 Agnes；视频接口文档要求公网可访问的 URL，Data URI 是否被接受取决于网关
- 视频是异步任务，最长等待 15 分钟
- 画册按**工作区**归类，同一工作区下所有对话的生成结果都会出现在一起
- 增强提示词会经由命令通道执行，因此会话日志里会留一条 `/agnes-prompt` 记录
