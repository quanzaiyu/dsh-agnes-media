/**
 * Browser half of the Agnes media bundle.
 *
 * It contributes three surfaces:
 *
 * 1. A mode picker in the New Session row, next to the shipped agent-preset
 *    control. Choosing a mode seeds the composer with the matching slash
 *    command, so the next Enter runs the Host command instead of sending an
 *    ordinary message.
 * 2. A row below the composer, shown while the draft carries a media command.
 *    It holds the style, size and ratio dropdowns, the prompt enhancer, and the
 *    outcome of the last generation with its file actions.
 * 3. A settings card on the Plugins page that writes the Agnes API key, the
 *    endpoint region and the generation options. The key is stored as a
 *    credential, so it never travels back to the browser.
 *
 * The composer never echoes a command result, so this half also renders the
 * outcome of a generation itself: it listens for the command lifecycle and
 * shows the image, the saved path or the failure next to the composer.
 */

window.__ModuleLoader__.load({
  id: '@quanzaiyu/agnes-media',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /** Locale namespace of this plugin. */
    const NS = 'agnesMedia';

    /** Credential reference that holds the Agnes API key. */
    const API_KEY_REF = 'AGNES_API_KEY';

    /** Credential reference that holds the endpoint region. */
    const REGION_REF = 'AGNES_REGION';

    /** Credential reference that holds the generation options as one JSON object. */
    const OPTIONS_REF = 'AGNES_MEDIA_OPTIONS';

    /** Local mirror of the endpoint region, used to render the current choice. */
    const REGION_MIRROR = 'agnes-media.region';

    /** Local mirror of the generation options, used to render the current choice. */
    const OPTIONS_MIRROR = 'agnes-media.options';

    /** HTTP prefix the Host serves generated assets on. */
    const ASSET_PREFIX = '/agnes-media/asset';

    /**
     * The URL of one generated asset, served by the Host over HTTP.
     *
     * @param {string} path - the absolute file path.
     * @returns {string} the same-origin URL.
     */
    function assetUrl(path) {
      return ASSET_PREFIX + '?path=' + encodeURIComponent(path);
    }

    /** The four composer modes, in the order the picker lists them. */
    const MODES = [
      { id: 'text2image', command: 'agnes-image', kind: 'image', needsImage: false },
      { id: 'image2image', command: 'agnes-image-edit', kind: 'image', needsImage: true },
      { id: 'text2video', command: 'agnes-video', kind: 'video', needsImage: false },
      { id: 'image2video', command: 'agnes-video-image', kind: 'video', needsImage: true },
    ];

    /** Style presets. The ids match the Host's style table. */
    const STYLES = [
      'none', 'cartoon', 'anime', 'sketch', 'realistic', 'render3d',
      'watercolor', 'oil', 'cyberpunk', 'pixel', 'cinematic',
    ];

    /** Output tiers the image model accepts. */
    const IMAGE_SIZES = ['1K', '2K', '3K', '4K'];

    /** Aspect ratios both models accept. */
    const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'];

    /** Video lengths the video model accepts, in seconds. */
    const VIDEO_SECONDS = ['4', '5', '8', '12'];

    /** Chinese dictionary. */
    const zh = {
      modeTitle: '媒体生成',
      modeHint: '选择一个生成模式',
      modeText2image: '文生图',
      modeText2imageHint: '用文字描述生成图片',
      modeImage2image: '图生图',
      modeImage2imageHint: '按描述改写已附图片',
      modeText2video: '文生视频',
      modeText2videoHint: '用文字描述生成视频',
      modeImage2video: '图生视频',
      modeImage2videoHint: '用已附图片生成视频',
      modeClear: '清除模式',
      styleLabel: '风格',
      styleNone: '默认',
      styleCartoon: '卡通',
      styleAnime: '动漫',
      styleSketch: '素描',
      styleRealistic: '写实',
      styleRender3d: '3D',
      styleWatercolor: '水彩',
      styleOil: '油画',
      styleCyberpunk: '赛博朋克',
      stylePixel: '像素',
      styleCinematic: '电影感',
      sizeLabel: '尺寸',
      ratioLabel: '比例',
      secondsLabel: '时长',
      enhance: '增强提示词',
      enhanceHint: '用 Agnes 文本模型把这句话扩写成详细提示词',
      enhancing: '正在增强…',
      enhanceEmpty: '先写一句描述，再点增强。',
      enhanceFailed: '增强失败：',
      running: '正在生成，请稍候…',
      runningVideo: '正在生成视频，通常需要一到数分钟…',
      savedTo: '已保存到',
      openFile: '用本地默认程序打开',
      openWith: '选择打开方式',
      openDefaultMark: '（默认）',
      openFolder: '在资源管理器中打开所在文件夹',
      again: '再来一张',
      openFailed: '无法在本机打开该文件。',
      notReady: '本机没有可用的桌面程序。',
      galleryTitle: '生成资产',
      galleryHint: '本工作区 agnes-output 文件夹里的全部生成结果',
      galleryEmpty: '还没有生成任何资产。',
      galleryFailed: '读取生成资产失败。',
      galleryLoading: '正在读取…',
      galleryRefresh: '刷新',
      galleryDiagnose: '诊断',
      galleryNoPreview: '这条记录没有可用的在线预览，可以直接用本地程序打开。',
      galleryClose: '关闭',
      galleryOpenFile: '用本地默认程序打开',
      galleryReveal: '在资源管理器中显示',
      settingsTitle: 'Agnes 媒体生成',
      settingsDescription: '使用 Agnes 免费图像与视频模型，在输入框上方直接选择文生图、图生图、文生视频和图生视频。',
      apiKey: 'Agnes API Key',
      apiKeyHint: '保存在本机凭据存储中，不会回传到浏览器，也不会写入配置文件。',
      apiKeySet: '已配置',
      apiKeyUnset: '未配置',
      apiKeyPlaceholder: '粘贴 Agnes API Key',
      apiKeySaved: 'API Key 已保存。',
      apiKeyCleared: 'API Key 已清除。',
      apiKeyFailed: 'API Key 保存失败：',
      region: '接口地址',
      regionHint: '国内与国际两套网关任选其一。',
      regionCn: '国内',
      regionIntl: '国际',
      regionCnUrl: 'https://apihub.agnes-ai.cn/v1',
      regionIntlUrl: 'https://apihub.agnes-ai.com/v1',
      regionSaved: '接口地址已切换。',
      regionFailed: '接口地址切换失败：',
      save: '保存',
      remove: '清除',
      configured: 'Agnes API Key 已配置，可以直接使用媒体生成模式。',
      notConfigured: '尚未配置 Agnes API Key，请先在此填入。',
      notWritable: '当前凭据存储不可写。',
    };

    /** English dictionary. */
    const en = {
      modeTitle: 'Media',
      modeHint: 'Choose a generation mode',
      modeText2image: 'Text to image',
      modeText2imageHint: 'Generate an image from a prompt',
      modeImage2image: 'Image to image',
      modeImage2imageHint: 'Rewrite an attached image',
      modeText2video: 'Text to video',
      modeText2videoHint: 'Generate a video from a prompt',
      modeImage2video: 'Image to video',
      modeImage2videoHint: 'Animate an attached image',
      modeClear: 'Clear mode',
      styleLabel: 'Style',
      styleNone: 'Default',
      styleCartoon: 'Cartoon',
      styleAnime: 'Anime',
      styleSketch: 'Sketch',
      styleRealistic: 'Realistic',
      styleRender3d: '3D',
      styleWatercolor: 'Watercolor',
      styleOil: 'Oil',
      styleCyberpunk: 'Cyberpunk',
      stylePixel: 'Pixel',
      styleCinematic: 'Cinematic',
      sizeLabel: 'Size',
      ratioLabel: 'Ratio',
      secondsLabel: 'Length',
      enhance: 'Enhance prompt',
      enhanceHint: 'Expand this description into a detailed prompt with the Agnes text model',
      enhancing: 'Enhancing…',
      enhanceEmpty: 'Write a description first, then enhance it.',
      enhanceFailed: 'Could not enhance the prompt: ',
      running: 'Generating…',
      runningVideo: 'Generating the video, usually one to a few minutes…',
      savedTo: 'Saved to',
      openFile: 'Open with the local default application',
      openWith: 'Choose an application',
      openDefaultMark: ' (default)',
      openFolder: 'Show the folder in the file manager',
      again: 'Generate another',
      openFailed: 'The host could not open that file.',
      notReady: 'This host has no desktop application available.',
      galleryTitle: 'Generated assets',
      galleryHint: 'Everything this workspace generated into the agnes-output folder',
      galleryEmpty: 'No assets yet.',
      galleryFailed: 'Could not read the generated assets.',
      galleryLoading: 'Loading…',
      galleryRefresh: 'Refresh',
      galleryDiagnose: 'Diagnose',
      galleryNoPreview: 'This record has no online preview; open it with a local application.',
      galleryClose: 'Close',
      galleryOpenFile: 'Open with the local default application',
      galleryReveal: 'Show in the file manager',
      settingsTitle: 'Agnes media',
      settingsDescription: 'Use the free Agnes image and video models, and pick text-to-image, image-to-image, text-to-video or image-to-video above the composer.',
      apiKey: 'Agnes API key',
      apiKeyHint: 'Stored in the local credential store. It never travels back to the browser and never enters a configuration file.',
      apiKeySet: 'Configured',
      apiKeyUnset: 'Not configured',
      apiKeyPlaceholder: 'Paste the Agnes API key',
      apiKeySaved: 'API key saved.',
      apiKeyCleared: 'API key cleared.',
      apiKeyFailed: 'Could not save the API key: ',
      region: 'Endpoint',
      regionHint: 'Pick the domestic or the international gateway.',
      regionCn: 'China',
      regionIntl: 'International',
      regionCnUrl: 'https://apihub.agnes-ai.cn/v1',
      regionIntlUrl: 'https://apihub.agnes-ai.com/v1',
      regionSaved: 'Endpoint switched.',
      regionFailed: 'Could not switch the endpoint: ',
      save: 'Save',
      remove: 'Clear',
      configured: 'The Agnes API key is configured; the media modes are ready.',
      notConfigured: 'No Agnes API key yet. Enter one here first.',
      notWritable: 'The credential store is not writable.',
    };

    /** A tiny observable store: the components read it through useSyncExternalStore. */
    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set(next) {
          state = next;
          for (const listener of listeners) listener();
        },
      };
    }

    /**
     * Read the local mirror of the endpoint region.
     *
     * The credential store never returns a value, so the browser keeps its own
     * copy of the choice purely for rendering. The Host keeps the authority.
     *
     * @returns {string} `cn` or `intl`.
     */
    function readRegionMirror() {
      try {
        const value = window.localStorage.getItem(REGION_MIRROR);
        return value === 'cn' ? 'cn' : 'intl';
      } catch {
        return 'intl';
      }
    }

    /**
     * Write the local mirror of the endpoint region.
     *
     * @param {string} region - `cn` or `intl`.
     */
    function writeRegionMirror(region) {
      try {
        window.localStorage.setItem(REGION_MIRROR, region);
      } catch {}
    }

    /**
     * Read the local mirror of the generation options.
     *
     * @returns {object} the mirrored options.
     */
    function readOptionsMirror() {
      const fallback = { style: 'none', size: '2K', ratio: '16:9', seconds: '5' };
      try {
        const raw = window.localStorage.getItem(OPTIONS_MIRROR);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return fallback;
        return {
          style: typeof parsed.style === 'string' ? parsed.style : fallback.style,
          size: typeof parsed.size === 'string' ? parsed.size : fallback.size,
          ratio: typeof parsed.ratio === 'string' ? parsed.ratio : fallback.ratio,
          seconds: typeof parsed.seconds === 'string' ? parsed.seconds : fallback.seconds,
        };
      } catch {
        return fallback;
      }
    }

    /**
     * Write the local mirror of the generation options.
     *
     * @param {object} options - the options to mirror.
     */
    function writeOptionsMirror(options) {
      try {
        window.localStorage.setItem(OPTIONS_MIRROR, JSON.stringify(options));
      } catch {}
    }

    /** Shared control styles, built from theme tokens only. */
    const styles = {
      wrapper: {
        display: 'inline-flex',
        alignItems: 'center',
      },
      seat: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '30px',
        padding: '0 10px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-interactive-bg-hover)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        lineHeight: '18px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      seatActive: {
        borderColor: 'var(--dsw-alias-state-business-primary)',
      },
      seatCompact: {
        height: '26px',
        padding: '0 8px',
        fontSize: '12px',
      },
      menu: {
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1000,
        minWidth: '180px',
        maxHeight: '320px',
        overflowY: 'auto',
        padding: '4px',
        borderRadius: 'var(--dsw-radius-lg)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-module-platform)',
        boxShadow: 'var(--dsw-elevation-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
      item: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '8px 10px',
        borderRadius: 'var(--dsw-radius-md)',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
      },
      itemName: {
        fontSize: '13px',
        lineHeight: '18px',
      },
      itemHint: {
        fontSize: '12px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      clear: {
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer',
        fontSize: '12px',
        padding: '2px 4px',
      },
      dock: {
        boxSizing: 'border-box',
        width: 'calc(100% - var(--dsh-composer-side-clearance, 0px) * 2)',
        maxWidth: 'var(--dsh-composer-card-max-width, 100%)',
        margin: '0 auto',
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '0 4px',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      },
      rowLabel: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary)',
        flex: 'none',
      },
      spacer: {
        flex: '1 1 auto',
      },
      card: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-module-platform)',
        minWidth: 0,
      },
      galleryLayer: {
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        pointerEvents: 'auto',
      },
      galleryScrim: {
        position: 'absolute',
        inset: 0,
        background: 'var(--dsw-alias-bg-base)',
        opacity: 0.94,
        cursor: 'pointer',
      },
      galleryPanel: {
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: 'min(960px, 100%)',
        maxHeight: '100%',
        padding: '16px',
        borderRadius: 'var(--dsw-radius-lg)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-module-platform)',
        boxShadow: 'var(--dsw-elevation-soft)',
        pointerEvents: 'auto',
      },
      galleryHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      },
      galleryTitle: {
        fontSize: '15px',
        fontWeight: '600',
        color: 'var(--dsw-alias-label-primary)',
        flex: '1 1 auto',
      },
      galleryHint: {
        fontSize: '12px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      galleryPreview: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '8px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        minHeight: '120px',
      },
      galleryPreviewImage: {
        maxWidth: '100%',
        maxHeight: '320px',
        objectFit: 'contain',
        borderRadius: 'var(--dsw-radius-md)',
      },
      galleryPreviewVideo: {
        maxWidth: '100%',
        maxHeight: '320px',
        borderRadius: 'var(--dsw-radius-md)',
      },
      galleryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
        gap: '10px',
        overflowY: 'auto',
        padding: '2px',
      },
      galleryItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '6px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--dsw-alias-label-primary)',
      },
      galleryItemActive: {
        borderColor: 'var(--dsw-alias-state-business-primary)',
      },
      galleryThumb: {
        width: '100%',
        height: '96px',
        objectFit: 'cover',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-module-platform)',
      },
      galleryThumbPlaceholder: {
        width: '100%',
        height: '96px',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-module-platform)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '12px',
      },
      galleryName: {
        fontSize: '11px',
        lineHeight: '15px',
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      galleryMeta: {
        fontSize: '10px',
        lineHeight: '14px',
        color: 'var(--dsw-alias-label-tertiary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      galleryPrompt: {
        fontSize: '12px',
        lineHeight: '17px',
        color: 'var(--dsw-alias-label-primary)',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      cardText: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0,
        flex: '1 1 auto',
      },
      cardTitle: {
        fontSize: '13px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      cardHint: {
        fontSize: '12px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      thumb: {
        width: '44px',
        height: '44px',
        objectFit: 'cover',
        borderRadius: 'var(--dsw-radius-md)',
        flex: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
      },
      iconButton: {
        width: '30px',
        height: '30px',
        padding: '0',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-interactive-bg-hover)',
        color: 'var(--dsw-alias-label-primary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flex: 'none',
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        marginBottom: '16px',
      },
      label: {
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--dsw-alias-label-primary)',
      },
      hint: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      input: {
        height: '32px',
        padding: '0 10px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-module-platform)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
      },
      radioRow: {
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      },
      radioItem: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: 'var(--dsw-alias-label-primary)',
      },
      button: {
        height: '30px',
        padding: '0 12px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-interactive-bg-hover)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flex: 'none',
      },
      buttonPrimary: {
        borderColor: 'var(--dsw-alias-state-business-primary)',
      },
      status: {
        marginTop: '8px',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      notice: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
        flex: '1 1 100%',
      },
      summary: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontSize: '13px',
        color: 'var(--dsw-alias-label-secondary)',
      },
    };

    /**
     * The media type of one generated file, from its name.
     *
     * @param {string} name - the file name.
     * @returns {string} the media type.
     */
    function mediaTypeOf(name) {
      if (/\.png$/i.test(name)) return 'image/png';
      if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
      if (/\.webp$/i.test(name)) return 'image/webp';
      if (/\.gif$/i.test(name)) return 'image/gif';
      if (/\.mp4$/i.test(name)) return 'video/mp4';
      return 'application/octet-stream';
    }

    /**
     * The dictionary key of one mode.
     *
     * @param {object} mode - one mode descriptor.
     * @returns {string} the dictionary suffix, for example `Text2image`.
     */
    function modeKey(mode) {
      return mode.id.charAt(0).toUpperCase() + mode.id.slice(1);
    }

    /**
     * The dictionary key of one style.
     *
     * @param {string} style - one style id.
     * @returns {string} the dictionary suffix, for example `Cartoon`.
     */
    function styleKey(style) {
      return style.charAt(0).toUpperCase() + style.slice(1);
    }

    /**
     * Split the Host's command result into its readable line and its payload.
     *
     * @param {string} text - the command result text.
     * @returns {{message: string, payload: object | undefined}} the parsed result.
     */
    function parseResult(text) {
      const value = typeof text === 'string' ? text : '';
      const lines = value.split('\n');
      const last = lines[lines.length - 1] ?? '';
      if (last.startsWith('{')) {
        try {
          const payload = JSON.parse(last);
          if (payload !== null && typeof payload === 'object') {
            return { message: lines.slice(0, -1).join('\n'), payload };
          }
        } catch {}
      }
      return { message: value, payload: undefined };
    }

    /**
     * The mode the current draft carries, if any.
     *
     * @param {string} draft - the composer draft.
     * @returns {object | undefined} the matching mode.
     */
    function modeOf(draft) {
      const text = typeof draft === 'string' ? draft : '';
      return MODES.find((mode) => text.trimStart().startsWith('/' + mode.command));
    }

    /**
     * A compact dropdown: one button that opens a portal menu.
     */
    function Dropdown(props) {
      const { label, value, options, onSelect, compact } = props;
      const [open, setOpen] = React.useState(false);
      const [anchor, setAnchor] = React.useState(undefined);
      const buttonRef = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (event.target instanceof Node && event.target.closest('[data-agnes-menu]') === null) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [open]);

      const toggle = () => {
        if (open) {
          setOpen(false);
          return;
        }
        const rect = buttonRef.current === null ? undefined : buttonRef.current.getBoundingClientRect();
        setAnchor(rect === undefined ? undefined : { left: rect.left, top: rect.bottom + 4 });
        setOpen(true);
      };

      const seat = h('button', {
        type: 'button',
        ref: buttonRef,
        'data-agnes-menu': 'seat',
        style: compact ? Object.assign({}, styles.seat, styles.seatCompact) : styles.seat,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: toggle,
      }, h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, label),
      h('span', null, value),
      h('svg', {
        viewBox: '0 0 24 24', width: 13, height: 13, 'aria-hidden': true, style: { display: 'block' },
      }, h('path', {
        d: 'M6 9.5l6 6 6-6', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      })));

      const menu = open === false ? null : ReactDOM.createPortal(h('div', {
        role: 'menu',
        'data-agnes-menu': 'menu',
        style: Object.assign({}, styles.menu, anchor === undefined ? {} : { left: anchor.left, top: anchor.top }),
      }, options.map((option) => h('button', {
        type: 'button',
        role: 'menuitem',
        key: option.id,
        'data-agnes-menu': option.id,
        style: styles.item,
        onMouseEnter: (event) => { event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; },
        onMouseLeave: (event) => { event.currentTarget.style.background = 'transparent'; },
        onClick: () => {
          setOpen(false);
          onSelect(option.id);
        },
      }, h('span', { style: styles.itemName }, option.label)))), document.body);

      return h('div', { style: styles.wrapper }, seat, menu);
    }

    /**
     * The mode picker above the composer.
     */
    function MediaModeControl(props) {
      const { t, inputActions } = props;
      const draft = props.useInput((state) => state.draft);
      const [open, setOpen] = React.useState(false);
      const [anchor, setAnchor] = React.useState(undefined);
      const seatRef = React.useRef(null);
      const text = typeof draft === 'string' ? draft : '';
      const active = modeOf(text);

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (event.target instanceof Node && event.target.closest('[data-agnes-mode]') === null) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [open]);

      const choose = (mode) => {
        setOpen(false);
        const token = '/' + mode.command + ' ';
        const body = text.trimStart().replace(/^\/[a-z0-9-]+\s*/, '').trim();
        inputActions.setDraft(body.length === 0 ? token : token + body);
      };

      const clear = () => {
        inputActions.setDraft(text.replace(/^\/[a-z0-9-]+\s*/, ''));
      };

      const toggle = () => {
        if (open) {
          setOpen(false);
          return;
        }
        const rect = seatRef.current === null ? undefined : seatRef.current.getBoundingClientRect();
        setAnchor(rect === undefined ? undefined : { left: rect.left, top: rect.bottom + 6 });
        setOpen(true);
      };

      const seat = h('button', {
        type: 'button',
        ref: seatRef,
        'data-agnes-mode': 'seat',
        style: active === undefined ? styles.seat : Object.assign({}, styles.seat, styles.seatActive),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        title: t('modeHint'),
        onClick: toggle,
      }, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        h('svg', {
          viewBox: '0 0 24 24',
          width: 15,
          height: 15,
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', { x: 2.5, y: 4.5, width: 19, height: 15, rx: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
        h('circle', { cx: 8.5, cy: 9.5, r: 1.8, fill: 'currentColor' }),
        h('path', { d: 'M4 17.5l4.6-4.6a2 2 0 012.8 0L21 22', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })),
        h('span', null, active === undefined ? t('modeTitle') : t('mode' + modeKey(active)))));

      const clearButton = active === undefined ? null : h('button', {
        type: 'button',
        'data-agnes-mode': 'clear',
        style: styles.clear,
        title: t('modeClear'),
        onClick: clear,
      }, '×');

      const menu = open === false ? null : ReactDOM.createPortal(h('div', {
        role: 'menu',
        'data-agnes-mode': 'menu',
        style: Object.assign({}, styles.menu, anchor === undefined ? {} : { left: anchor.left, top: anchor.top }),
      }, MODES.map((mode) => h('button', {
        type: 'button',
        role: 'menuitem',
        key: mode.id,
        'data-agnes-mode': mode.id,
        style: styles.item,
        onMouseEnter: (event) => { event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; },
        onMouseLeave: (event) => { event.currentTarget.style.background = 'transparent'; },
        onClick: () => choose(mode),
      }, h('span', { style: styles.itemName }, t('mode' + modeKey(mode))),
      h('span', { style: styles.itemHint }, t('mode' + modeKey(mode) + 'Hint'))))), document.body);

      return h('div', { style: styles.wrapper }, seat, clearButton, menu);
    }

    return {
      inject: [
        'slots',
        'locale',
        'remote',
        'sessions',
        'remote.credentials',
        'remote.commands',
        'remote.session',
        'remote.workspaceFiles',
      ],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agnes-media: dictionaries');

        const mirrored = readOptionsMirror();
        const store = createStore({
          style: mirrored.style,
          size: mirrored.size,
          ratio: mirrored.ratio,
          seconds: mirrored.seconds,
          results: {},
        });
        const publish = (patch) => store.set(Object.assign({}, store.getSnapshot(), patch));

        const settingsStore = createStore({
          configured: false,
          writable: true,
          region: readRegionMirror(),
          busy: false,
          message: undefined,
          error: undefined,
        });
        const publishSettings = (patch) => settingsStore.set(Object.assign({}, settingsStore.getSnapshot(), patch));

        // The gallery is a frame-wide surface, so its open state lives beside
        // the session-scoped store instead of inside it.
        const galleryStore = createStore({ open: false, sessionId: undefined });
        const openGallery = (sessionId) => galleryStore.set({ open: true, sessionId });
        const closeGallery = () => galleryStore.set({ open: false, sessionId: undefined });

        /**
         * Open one generated file with a local application.
         *
         * The Host reports the registered handlers for the file's type, so the
         * default button uses the operating system's own default instead of a
         * bare shell open, and the caret lets the user pick another handler.
         */
        /**
         * Open one generated file with a local application.
         *
         * The registered handlers are cached per file extension, so the menu
         * opens instantly and a background read picks up newly installed
         * handlers.
         */
        const appCache = new Map();

        /**
         * The extension that selects a file's registered handlers.
         *
         * @param {string} path - the file path.
         * @returns {string} the lowercase extension, or an empty string.
         */
        function extensionOf(path) {
          const match = /\.([A-Za-z0-9]+)$/.exec(typeof path === 'string' ? path : '');
          return match === null ? '' : match[1].toLowerCase();
        }

        /**
         * Read the registered handlers for one path and cache them.
         *
         * @param {string} path - the file path.
         * @returns {Promise<object[]>} the handlers, or an empty list.
         */
        async function refreshApplications(path) {
          try {
            const controller = new AbortController();
            const response = await ctx.remote.session.workspacePathApplications({ path }, controller.signal);
            const apps = response.ok && Array.isArray(response.value) ? response.value : [];
            appCache.set(extensionOf(path), apps);
            return apps;
          } catch {
            return [];
          }
        }

        function OpenButton(props) {
          const { t, path, onNotice } = props;
          const [menuOpen, setMenuOpen] = React.useState(false);
          const [apps, setApps] = React.useState(undefined);
          const [anchor, setAnchor] = React.useState(undefined);
          const buttonRef = React.useRef(null);

          React.useEffect(() => {
            if (!menuOpen) return undefined;
            const onPointerDown = (event) => {
              if (event.target instanceof Node && event.target.closest('[data-agnes-open]') === null) setMenuOpen(false);
            };
            document.addEventListener('pointerdown', onPointerDown, true);
            return () => document.removeEventListener('pointerdown', onPointerDown, true);
          }, [menuOpen]);

          const invoke = async (application) => {
            try {
              const controller = new AbortController();
              const response = await ctx.remote.session.openWorkspacePath(
                application === undefined ? { path } : { path, application }, controller.signal);
              if (response.ok) {
                onNotice(undefined);
                return true;
              }
              onNotice(t('openFailed') + ' ' + (response.error?.message ?? ''));
              return false;
            } catch (error) {
              onNotice(t('openFailed') + ' ' + (error instanceof Error ? error.message : String(error)));
              return false;
            }
          };

          const cachedApps = () => appCache.get(extensionOf(path));

          const openDefault = async () => {
            const cached = cachedApps();
            if (cached !== undefined) {
              refreshApplications(path).catch(() => {});
              const chosen = cached.find((app) => app.default === true) ?? cached[0];
              if (chosen !== undefined && await invoke(chosen.id)) return;
              await invoke(undefined);
              return;
            }
            const fresh = await refreshApplications(path);
            const chosen = fresh.find((app) => app.default === true) ?? fresh[0];
            if (chosen === undefined) {
              await invoke(undefined);
              return;
            }
            if (!await invoke(chosen.id)) await invoke(undefined);
          };

          const openMenu = async () => {
            const rect = buttonRef.current === null ? undefined : buttonRef.current.getBoundingClientRect();
            setAnchor(rect === undefined ? undefined : { left: rect.left, top: rect.bottom + 4 });
            setApps(cachedApps());
            setMenuOpen(true);
            setApps(await refreshApplications(path));
          };

          const menu = menuOpen === false ? null : ReactDOM.createPortal(h('div', {
            role: 'menu',
            'data-agnes-open': 'menu',
            style: Object.assign({}, styles.menu, anchor === undefined ? {} : { left: anchor.left, top: anchor.top }),
          },
          apps === undefined
            ? h('span', { style: styles.itemHint }, t('galleryLoading'))
            : apps.length === 0
              ? h('span', { style: styles.itemHint }, t('notReady'))
              : apps.map((app) => h('button', {
                type: 'button',
                role: 'menuitem',
                key: app.id,
                'data-agnes-open': app.id,
                style: styles.item,
                onClick: () => {
                  setMenuOpen(false);
                  invoke(app.id);
                },
              }, h('span', { style: styles.itemName }, app.name + (app.default === true ? t('openDefaultMark') : ''))))), document.body);

          return h('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '2px' } },
            h('button', {
              type: 'button',
              style: styles.iconButton,
              title: t('openFile'),
              onClick: () => { openDefault(); },
            }, h('svg', {
              viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
            },
            h('path', {
              d: 'M14 4h6v6M20 4l-8.5 8.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
            }),
            h('path', {
              d: 'M18 13.5V18a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
            }))),
            h('button', {
              type: 'button',
              ref: buttonRef,
              style: Object.assign({}, styles.iconButton, { width: '18px' }),
              title: t('openWith'),
              onClick: () => { openMenu(); },
            }, h('svg', {
              viewBox: '0 0 24 24', width: 12, height: 12, 'aria-hidden': true, style: { display: 'block' },
            },
            h('path', {
              d: 'M6 9.5l6 6 6-6', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
            }))),
            menu);
        }

        const readKeyState = async () => {
          try {
            const response = await ctx.remote.credentials.describe([API_KEY_REF]);
            if (!response.ok) return;
            const view = response.value?.[API_KEY_REF];
            publishSettings({ configured: view?.configured === true, writable: view?.writable !== false });
          } catch {
            publishSettings({ error: t('notWritable') });
          }
        };

        const writeKey = async (value) => {
          publishSettings({ busy: true, message: undefined, error: undefined });
          try {
            const response = value.length === 0
              ? await ctx.remote.credentials.unset(API_KEY_REF)
              : await ctx.remote.credentials.set(API_KEY_REF, value);
            if (response.ok === false) {
              publishSettings({ busy: false, error: t('apiKeyFailed') + (response.error?.message ?? '') });
              return;
            }
            publishSettings({ busy: false, message: value.length === 0 ? t('apiKeyCleared') : t('apiKeySaved') });
            await readKeyState();
          } catch (error) {
            publishSettings({ busy: false, error: t('apiKeyFailed') + (error instanceof Error ? error.message : String(error)) });
          }
        };

        const writeRegion = async (region) => {
          publishSettings({ busy: true, message: undefined, error: undefined });
          try {
            const response = await ctx.remote.credentials.set(REGION_REF, region);
            if (response.ok === false) {
              publishSettings({ busy: false, error: t('regionFailed') + (response.error?.message ?? '') });
              return;
            }
            writeRegionMirror(region);
            publishSettings({ busy: false, region, message: t('regionSaved') });
          } catch (error) {
            publishSettings({ busy: false, error: t('regionFailed') + (error instanceof Error ? error.message : String(error)) });
          }
        };

        const writeOptions = async (patch) => {
          const current = store.getSnapshot();
          const options = {
            style: patch.style ?? current.style,
            size: patch.size ?? current.size,
            ratio: patch.ratio ?? current.ratio,
            seconds: patch.seconds ?? current.seconds,
          };
          writeOptionsMirror(options);
          publish(options);
          try {
            await ctx.remote.credentials.set(OPTIONS_REF, JSON.stringify(options));
          } catch {}
        };

        ctx.effect(() => {
          const off = ctx.remote.$on('credentials/reference-updated', (ref) => {
            if (ref === API_KEY_REF) readKeyState();
          });
          return () => off();
        }, 'agnes-media: credential invalidations');

        ctx.effect(() => {
          readKeyState();
        }, 'agnes-media: initial credential read');

        // The composer never echoes a command result, so the outcome of a
        // generation is rendered here instead.
        ctx.effect(() => ctx.on('command/executed', (sessionId, name, result) => {
          if (typeof name !== 'string') return;
          if (!MODES.some((mode) => mode.command === name)) return;
          const { message, payload } = parseResult(result?.text);
          const failed = result?.kind === 'error';
          const results = Object.assign({}, store.getSnapshot().results);
          results[sessionId] = {
            kind: failed ? 'error' : 'done',
            message,
            payload,
          };
          publish({ results });
        }), 'agnes-media: command outcome');

        /**
         * The option row and the outcome of the last generation.
         */
        function MediaOptionsBar(props) {
          const { t, inputActions } = props;
          const state = props.useAgnesMedia((snapshot) => snapshot);
          const draft = props.useInput((input) => input.draft);
          const phase = props.useInput((input) => input.phase);
          const [notice, setNotice] = React.useState(undefined);
          const [enhancing, setEnhancing] = React.useState(false);
          const [canOpen, setCanOpen] = React.useState(false);
          const text = typeof draft === 'string' ? draft : '';
          const mode = modeOf(text);
          const result = state.results[props.sessionId];
          const payload = result?.payload;

          React.useEffect(() => {
            if (payload === undefined) return undefined;
            let cancelled = false;
            Promise.resolve(ctx.remote.session.canOpenWorkspacePath())
              .then((answer) => {
                if (!cancelled) setCanOpen(answer?.ok === true && answer.value === true);
              })
              .catch(() => {
                if (!cancelled) setCanOpen(false);
              });
            return () => { cancelled = true; };
          }, [payload]);

          if (mode === undefined && result === undefined) return null;

          const running = mode !== undefined && (phase === 'adjudicating' || phase === 'submitting');
          const isVideo = mode?.kind === 'video';

          const openPath = async (path, action) => {
            try {
              const controller = new AbortController();
              const response = await ctx.remote.session.openWorkspacePath(
                action === undefined ? { path } : { path, action }, controller.signal);
              setNotice(response.ok ? undefined : t('openFailed') + ' ' + (response.error?.message ?? ''));
            } catch (error) {
              setNotice(t('openFailed') + ' ' + (error instanceof Error ? error.message : String(error)));
            }
          };

          const enhance = async () => {
            const token = '/' + mode.command + ' ';
            const prompt = text.slice(text.indexOf(token) + token.length).trim();
            if (prompt.length === 0) {
              setNotice(t('enhanceEmpty'));
              return;
            }
            setEnhancing(true);
            setNotice(undefined);
            try {
              const controller = new AbortController();
              const response = await ctx.remote.commands.execute(
                props.sessionId, '/agnes-prompt ' + prompt, [], controller.signal);
              if (!response.ok) throw new Error(response.error?.message ?? '');
              const outcome = response.value?.result;
              if (outcome?.kind === 'success') {
                inputActions.setDraft(token + outcome.text);
              } else {
                setNotice(outcome?.text ?? t('enhanceFailed'));
              }
            } catch (error) {
              setNotice(t('enhanceFailed') + (error instanceof Error ? error.message : String(error)));
            }
            setEnhancing(false);
          };

          const rows = mode === undefined ? null : h('div', { style: styles.row },
            h(Dropdown, {
              label: t('styleLabel'),
              value: t('style' + styleKey(state.style)),
              options: STYLES.map((style) => ({ id: style, label: t('style' + styleKey(style)) })),
              onSelect: (value) => writeOptions({ style: value }),
            }),
            h(Dropdown, {
              label: isVideo ? t('secondsLabel') : t('sizeLabel'),
              value: isVideo ? state.seconds + 's' : state.size,
              options: isVideo
                ? VIDEO_SECONDS.map((value) => ({ id: value, label: value + 's' }))
                : IMAGE_SIZES.map((value) => ({ id: value, label: value })),
              onSelect: (value) => writeOptions(isVideo ? { seconds: value } : { size: value }),
            }),
            h(Dropdown, {
              label: t('ratioLabel'),
              value: state.ratio,
              options: RATIOS.map((value) => ({ id: value, label: value })),
              onSelect: (value) => writeOptions({ ratio: value }),
            }),
            h('span', { style: styles.spacer }),
            h('button', {
              type: 'button',
              style: styles.button,
              title: t('enhanceHint'),
              disabled: enhancing,
              onClick: () => { enhance(); },
            }, enhancing ? t('enhancing') : t('enhance')));

          const card = (() => {
            if (running) {
              return h('div', { style: styles.card },
                h('span', { style: styles.cardTitle }, isVideo ? t('runningVideo') : t('running')));
            }
            if (result === undefined) return null;
            if (result.kind === 'error') {
              return h('div', { style: styles.card },
                h('span', { style: styles.cardTitle }, result.message));
            }
            const preview = typeof payload?.path === 'string' && payload.path.length > 0
              ? assetUrl(payload.path)
              : (typeof payload?.url === 'string' && payload.url.length > 0 ? payload.url : undefined);
            const modeOfPayload = MODES.find((entry) => entry.id === payload?.mode);
            return h('div', { style: styles.card },
              preview === undefined ? null : h('a', {
                href: preview,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: t('openFile'),
              }, h('img', {
                src: preview,
                alt: result.message,
                style: styles.thumb,
                onError: (event) => {
                  if (typeof payload?.url === 'string' && payload.url.length > 0 && event.currentTarget.src !== payload.url) {
                    event.currentTarget.src = payload.url;
                  }
                },
              })),
              h('div', { style: styles.cardText },
                h('span', { style: styles.cardTitle, title: typeof payload?.finalPrompt === 'string' ? payload.finalPrompt : result.message }, result.message),
                typeof payload?.path === 'string'
                  ? h('span', { style: styles.cardHint, title: payload.path }, t('savedTo') + ' ' + payload.path)
                  : null),
              canOpen && typeof payload?.path === 'string'
                ? h(OpenButton, { t, path: payload.path, onNotice: setNotice })
                : null,
              canOpen && typeof payload?.dir === 'string'
                ? h('button', {
                  type: 'button',
                  style: styles.iconButton,
                  title: t('openFolder'),
                  onClick: () => { openPath(payload.dir, 'reveal'); },
                }, h('svg', {
                  viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
                },
                h('path', {
                  d: 'M3 7.5a1.5 1.5 0 011.5-1.5h3.6l1.6 2H19.5A1.5 1.5 0 0121 9.5v8a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z',
                  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round',
                })))
                : null,
              h('button', {
                type: 'button',
                style: styles.iconButton,
                title: t('galleryTitle'),
                onClick: () => { openGallery(props.sessionId); },
              }, h('svg', {
                viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
              },
              h('rect', { x: 3, y: 3, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
              h('rect', { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
              h('rect', { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
              h('rect', { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }))),
              modeOfPayload === undefined ? null : h('button', {
                type: 'button',
                style: styles.iconButton,
                title: t('again'),
                onClick: () => { inputActions.setDraft('/' + modeOfPayload.command + ' '); },
              }, h('svg', {
                viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
              },
              h('path', {
                d: 'M20 12a8 8 0 11-2.6-5.9M20 4v4h-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              }))));
          })();

          return h('div', { style: styles.dock },
            card,
            rows,
            notice === undefined ? null : h('div', { style: styles.notice }, notice));
        }

        /**
         * The settings card on the Plugins page.
         */
        function AgnesSettingsCard(props) {
          const { t } = props;
          const state = props.useAgnesSettings((snapshot) => snapshot);
          const [key, setKey] = React.useState('');

          if (props.view === 'summary') {
            return h('div', { style: styles.summary }, t('settingsDescription'));
          }

          const busy = state.busy;
          return h('div', { style: { display: 'flex', flexDirection: 'column' } },
            h('div', { style: styles.field },
              h('span', { style: styles.label }, t('apiKey')),
              h('span', { style: styles.hint }, t('apiKeyHint')),
              h('input', {
                type: 'password',
                id: 'agnes-media-api-key',
                style: styles.input,
                value: key,
                placeholder: t('apiKeyPlaceholder'),
                disabled: busy || !state.writable,
                autoComplete: 'off',
                onChange: (event) => setKey(event.target.value),
              }),
              h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' } },
                h('button', {
                  type: 'button',
                  style: Object.assign({}, styles.button, styles.buttonPrimary),
                  disabled: busy || !state.writable || key.trim().length === 0,
                  onClick: () => props.saveKey(key.trim()),
                }, t('save')),
                h('button', {
                  type: 'button',
                  style: styles.button,
                  disabled: busy || !state.writable || !state.configured,
                  onClick: () => props.clearKey(),
                }, t('remove')),
                h('span', { style: styles.hint }, state.configured ? t('apiKeySet') : t('apiKeyUnset'))),
              state.message === undefined ? null : h('span', { style: styles.status }, state.message),
              state.error === undefined ? null : h('span', { style: styles.status }, state.error)),

            h('div', { style: styles.field },
              h('span', { style: styles.label }, t('region')),
              h('span', { style: styles.hint }, t('regionHint')),
              h('div', { style: styles.radioRow },
                h('label', { style: styles.radioItem },
                  h('input', {
                    type: 'radio',
                    name: 'agnes-media-region',
                    checked: state.region === 'cn',
                    disabled: busy,
                    onChange: () => props.saveRegion('cn'),
                  }),
                  h('span', null, t('regionCn')),
                  h('span', { style: styles.hint }, t('regionCnUrl'))),
                h('label', { style: styles.radioItem },
                  h('input', {
                    type: 'radio',
                    name: 'agnes-media-region',
                    checked: state.region === 'intl',
                    disabled: busy,
                    onChange: () => props.saveRegion('intl'),
                  }),
                  h('span', null, t('regionIntl')),
                  h('span', { style: styles.hint }, t('regionIntlUrl'))))));
        }

        /**
         * The gallery of generated assets.
         *
         * It lists the workspace folder the plugin writes into and reads the
         * bytes through the Session Remote, so the browser never needs a path
         * it cannot resolve.
         */
        function AssetGallery(props) {
          const { t } = props;
          const state = props.useAgnesGallery((snapshot) => snapshot);
          const [items, setItems] = React.useState([]);
          const [message, setMessage] = React.useState(undefined);
          const [loading, setLoading] = React.useState(false);
          const [selected, setSelected] = React.useState(undefined);
          const [attempt, setAttempt] = React.useState(0);
          const [failed, setFailed] = React.useState({});
          const [blobs, setBlobs] = React.useState({});
          const [probe, setProbe] = React.useState({});
          const blobUrls = React.useRef(new Set());
          const sessionId = state.sessionId;
          const current = items.find((item) => item.name === selected);

          /**
           * The source a thumbnail or preview should use: a locally fetched
           * blob when the direct load failed, then the public Agnes URL, then
           * the Host route. A failed load advances to the next source.
           */
          const srcOf = (item) => {
            if (item === undefined) return undefined;
            if (blobs[item.name] !== undefined) return blobs[item.name];
            const step = failed[item.name] ?? 0;
            const sources = [];
            if (item.remote !== undefined) sources.push(item.remote);
            sources.push(item.url);
            return sources[step];
          };

          /**
           * Fetch one asset through the Host route and hold it as a blob URL.
           *
           * This is the last resort for an image the browser refuses to load
           * straight from the route; it also records the HTTP status so a
           * failure can be explained.
           */
          const resolveLocally = async (item) => {
            try {
              const response = await fetch(assetUrl(item.path), { credentials: 'same-origin' });
              if (!response.ok) {
                setProbe((current) => Object.assign({}, current, { [item.name]: `route ${response.status}` }));
                return;
              }
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              blobUrls.current.add(url);
              setBlobs((current) => Object.assign({}, current, { [item.name]: url }));
              setProbe((current) => Object.assign({}, current, { [item.name]: `route 200 · ${blob.type} · ${blob.size} B` }));
            } catch (error) {
              setProbe((current) => Object.assign({}, current, { [item.name]: String(error) }));
            }
          };

          const advance = (item) => {
            const step = (failed[item.name] ?? 0) + 1;
            const sources = (item.remote !== undefined ? 1 : 0) + 1;
            setFailed((current) => Object.assign({}, current, { [item.name]: step }));
            if (step >= sources) resolveLocally(item);
          };

          React.useEffect(() => {
            if (!state.open || sessionId === undefined) return undefined;
            const controller = new AbortController();
            let cancelled = false;
            setItems([]);
            setMessage(undefined);
            setSelected(undefined);
            setLoading(true);
            (async () => {
              try {
                const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd ?? '';
                const separator = cwd.includes('\\') ? '\\' : '/';
                const absolute = (name) => (cwd.length === 0
                  ? name
                  : `${cwd.replace(/[/\\]+$/, '')}${separator}${name}`);

                // The manifest only carries metadata; the directory listing is
                // what decides which files exist.
                const meta = new Map();
                try {
                  const manifest = await ctx.remote.workspaceFiles.read(
                    sessionId, 'agnes-output/index.jsonl', {}, controller.signal);
                  if (manifest.ok && typeof manifest.value?.text === 'string') {
                    for (const line of manifest.value.text.split('\n')) {
                      if (line.trim().length === 0) continue;
                      try {
                        const entry = JSON.parse(line);
                        if (entry !== null && typeof entry === 'object' && typeof entry.name === 'string') {
                          meta.set(entry.name, entry);
                        }
                      } catch {}
                    }
                  }
                } catch {}

                const listed = await ctx.remote.workspaceFiles.list(sessionId, 'agnes-output', controller.signal);
                const names = listed.ok
                  ? listed.value.entries
                    .filter((entry) => entry.type === 'file' && /\.(png|jpe?g|webp|gif|mp4)$/i.test(entry.name))
                    .map((entry) => entry.name)
                  : [];
                const collected = names
                  .sort((left, right) => right.localeCompare(left))
                  .map((name) => {
                    const entry = meta.get(name) ?? {};
                    const path = absolute(name);
                    return {
                      name,
                      path,
                      dir: absolute('agnes-output'),
                      url: assetUrl(path),
                      remote: typeof entry.url === 'string' && entry.url.length > 0 ? entry.url : undefined,
                      kind: /\.mp4$/i.test(name) ? 'video' : 'image',
                      size: entry.size,
                      ratio: entry.ratio,
                      style: entry.style,
                      prompt: typeof entry.prompt === 'string' && entry.prompt.length > 0 ? entry.prompt : undefined,
                      model: entry.model,
                      createdAt: entry.createdAt,
                      bytes: entry.bytes,
                    };
                  });

                if (cancelled) return;
                setItems(collected);
                setLoading(false);
              } catch (error) {
                if (cancelled) return;
                setMessage(t('galleryFailed') + ' ' + (error instanceof Error ? error.message : String(error)));
                setLoading(false);
              }
            })();
            return () => {
              cancelled = true;
              controller.abort();
            };
          }, [state.open, sessionId, attempt]);

          React.useEffect(() => {
            if (!state.open) return undefined;
            const onKeyDown = (event) => {
              if (event.key === 'Escape') closeGallery();
            };
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
          }, [state.open]);

          // Release every blob the last session of the gallery fetched.
          React.useEffect(() => {
            if (state.open) return undefined;
            for (const url of blobUrls.current) URL.revokeObjectURL(url);
            blobUrls.current.clear();
            setBlobs({});
            setProbe({});
            return undefined;
          }, [state.open]);

          if (!state.open) return null;

          const openPath = async (path, action) => {
            try {
              const controller = new AbortController();
              const response = await ctx.remote.session.openWorkspacePath(
                action === undefined ? { path } : { path, action }, controller.signal);
              if (!response.ok) {
                setMessage(t('openFailed') + ' ' + (response.error?.message ?? ''));
              } else {
                setMessage(undefined);
              }
            } catch (error) {
              setMessage(t('openFailed') + ' ' + (error instanceof Error ? error.message : String(error)));
            }
          };

          const currentUrl = srcOf(current);

          /**
           * Report what the Host route actually answers for one asset, so a
           * rendering failure can be told apart from a transport failure.
           */
          const diagnose = async () => {
            const target = current ?? items[0];
            if (target === undefined) {
              setMessage(t('galleryEmpty'));
              return;
            }
            try {
              const response = await fetch(assetUrl(target.path), { credentials: 'same-origin', cache: 'no-store' });
              const type = response.headers.get('content-type') ?? '?';
              const length = response.headers.get('content-length') ?? '?';
              let size = '?';
              try {
                size = String((await response.blob()).size);
              } catch {}
              setMessage(`route ${response.status} · ${type} · ${length} · ${size} B · ${target.path}`);
            } catch (error) {
              setMessage('route failed: ' + (error instanceof Error ? error.message : String(error)));
            }
          };

          const preview = current === undefined ? null : h('div', { style: styles.galleryPreview },
            currentUrl === undefined
              ? h('span', { style: styles.galleryHint }, t('galleryNoPreview'))
              : current.kind === 'video'
                ? h('video', {
                  src: currentUrl,
                  controls: true,
                  style: styles.galleryPreviewVideo,
                  onError: () => advance(current),
                })
                : h('img', {
                  src: currentUrl,
                  alt: current.name,
                  style: styles.galleryPreviewImage,
                  onError: () => advance(current),
                }),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, maxWidth: '260px' } },
              h('span', { style: styles.galleryHint }, current.name),
              current.prompt === undefined
                ? null
                : h('span', { style: styles.galleryPrompt, title: current.prompt }, current.prompt),
              h('div', { style: { display: 'flex', gap: '8px' } },
                h(OpenButton, { t, path: current.path, onNotice: setMessage }),
                h('button', {
                  type: 'button',
                  style: styles.iconButton,
                  title: t('galleryReveal'),
                  onClick: () => { openPath(current.dir, 'reveal'); },
                }, h('svg', {
                  viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
                },
                h('path', {
                  d: 'M3 7.5a1.5 1.5 0 011.5-1.5h3.6l1.6 2H19.5A1.5 1.5 0 0121 9.5v8a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z',
                  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round',
                }))))));

          const meta = (item) => {
            const parts = [];
            if (item.kind === 'video') parts.push('VIDEO');
            if (item.size !== undefined) parts.push(item.size);
            if (item.ratio !== undefined) parts.push(item.ratio);
            if (item.style !== undefined && item.style !== 'none') parts.push(item.style);
            if (probe[item.name] !== undefined) parts.push(probe[item.name]);
            return parts.join(' · ');
          };

          return h('div', { style: styles.galleryLayer },
            h('div', {
              style: styles.galleryScrim,
              onClick: () => closeGallery(),
            }),
            h('div', { style: styles.galleryPanel },
              h('div', { style: styles.galleryHeader },
                h('span', { style: styles.galleryTitle }, t('galleryTitle')),
                h('span', { style: styles.galleryHint }, t('galleryHint')),
                h('button', {
                  type: 'button',
                  style: styles.button,
                  onClick: () => setAttempt((value) => value + 1),
                }, t('galleryRefresh')),
                h('button', {
                  type: 'button',
                  style: styles.button,
                  title: t('galleryDiagnose'),
                  onClick: () => { diagnose(); },
                }, t('galleryDiagnose')),
                h('button', {
                  type: 'button',
                  style: styles.button,
                  onClick: () => closeGallery(),
                }, t('galleryClose'))),
              preview,
              message === undefined ? null : h('div', { style: styles.galleryHint }, message),
              loading ? h('div', { style: styles.galleryHint }, t('galleryLoading')) : null,
              items.length === 0 && !loading && message === undefined
                ? h('div', { style: styles.galleryHint }, t('galleryEmpty'))
                : h('div', { style: styles.galleryGrid }, items.map((item) => h('button', {
                  type: 'button',
                  key: item.name,
                  style: item.name === selected
                    ? Object.assign({}, styles.galleryItem, styles.galleryItemActive)
                    : styles.galleryItem,
                  onClick: () => setSelected(item.name),
                },
                item.kind === 'video'
                  ? h('div', { style: styles.galleryThumbPlaceholder }, 'VIDEO')
                  : srcOf(item) === undefined
                    ? h('div', { style: styles.galleryThumbPlaceholder }, 'IMG')
                    : h('img', {
                      src: srcOf(item),
                      alt: item.name,
                      style: styles.galleryThumb,
                      onError: () => advance(item),
                    }),
                h('span', { style: styles.galleryName, title: item.prompt ?? item.name }, item.name),
                h('span', { style: styles.galleryMeta }, meta(item))))))
          );
        }

        /**
         * The button that opens the gallery.
         */
        function GalleryButton(props) {
          const { t } = props;
          return h('button', {
            type: 'button',
            style: styles.iconButton,
            title: t('galleryTitle'),
            onClick: () => openGallery(props.sessionId),
          }, h('svg', {
            viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' },
          },
          h('rect', { x: 3, y: 3, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
          h('rect', { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
          h('rect', { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
          h('rect', { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 })));
        }

        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'agnes-media-mode',
          order: 10,
          label: () => t('modeTitle'),
          locale: NS,
          inject: () => ({ hooks: { agnesMedia: store } }),
        }, MediaModeControl));

        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'agnes-media-gallery',
          order: 20,
          label: () => t('galleryTitle'),
          locale: NS,
        }, GalleryButton));

        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'agnes-media-gallery',
          order: 30,
          label: () => t('galleryTitle'),
          locale: NS,
        }, GalleryButton));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'agnes-media-gallery',
          order: 60,
          label: () => t('galleryTitle'),
          locale: NS,
          inject: () => ({ hooks: { agnesGallery: galleryStore } }),
        }, AssetGallery));

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'agnes-media-options',
          order: 20,
          label: () => t('modeTitle'),
          locale: NS,
          inject: () => ({ hooks: { agnesMedia: store } }),
        }, MediaOptionsBar));

        ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item',
          id: 'agnes-media',
          order: 50,
          label: () => t('settingsTitle'),
          locale: NS,
          inject: () => ({
            hooks: { agnesSettings: settingsStore },
            saveKey: writeKey,
            clearKey: () => writeKey(''),
            saveRegion: writeRegion,
          }),
        }, AgnesSettingsCard));
      },
    };
  },
});
