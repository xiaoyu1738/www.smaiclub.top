const LIBRARY_PATH = '/videos.json';

const EMPTY_LIBRARY = {
  siteTitle: 'SMAI 俱乐部播放器',
  description: '请编辑 videos.json 来维护你的视频资源。',
  defaultPoster: '',
  videos: [],
};

function normalizeVariant(variant) {
  return {
    label: String(variant?.label || '').trim(),
    url: String(variant?.url || '').trim(),
    codec: String(variant?.codec || ''),
    resolution: String(variant?.resolution || ''),
  };
}

function normalizeVideo(video, index) {
  const id = String(video?.id || `video-${index + 1}`).trim();
  const rawVariants = Array.isArray(video?.variants)
    ? video.variants.map((variant) => normalizeVariant(variant)).filter((variant) => variant.url)
    : [];

  return {
    id,
    title: String(video?.title || `未命名视频 ${index + 1}`),
    cover: String(video?.cover || ''),
    url: String(video?.url || rawVariants[0]?.url || '').trim(),
    codec: String(video?.codec || rawVariants[0]?.codec || '未知'),
    resolution: String(video?.resolution || rawVariants[0]?.resolution || '未知'),
    duration: String(video?.duration || ''),
    tags: Array.isArray(video?.tags) ? video.tags.map((item) => String(item)) : [],
    variants: rawVariants,
  };
}

export async function loadLibrary() {
  const response = await fetch(LIBRARY_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`加载 ${LIBRARY_PATH} 失败: ${response.status}`);
  }

  const data = await response.json();
  const base = {
    ...EMPTY_LIBRARY,
    ...data,
  };

  const videos = Array.isArray(base.videos)
    ? base.videos
        .map((video, index) => normalizeVideo(video, index))
        .filter((video) => video.url)
    : [];

  return {
    ...base,
    videos,
  };
}

export const JSON_TEMPLATE = {
  siteTitle: 'SMAI 俱乐部播放器',
  description: '在此文件中管理你的媒体资源。',
  defaultPoster: 'https://example.com/default-cover.jpg',
  videos: [
    {
      id: 'my-video-id',
      title: '视频标题',
      cover: 'https://example.com/video-cover.jpg',
      url: 'https://example.com/video.mp4',
      codec: 'H.264 或 H.265',
      resolution: '1080p 或 4K',
      duration: '00:00',
      tags: ['标签A', '标签B'],
      variants: [
        {
          label: '4K / H.265',
          url: 'https://example.com/video-4k-h265.mp4',
          codec: 'H.265',
          resolution: '4K',
        },
        {
          label: '1080p / H.264',
          url: 'https://example.com/video-1080p-h264.mp4',
          codec: 'H.264',
          resolution: '1080p',
        },
      ],
    },
  ],
};
