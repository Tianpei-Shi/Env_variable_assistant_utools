export const FONT_LEVEL_CLASSES = {
  1: 'text-xs',
  2: 'text-sm',
  3: 'text-base',
  4: 'text-lg',
}

export const FONT_LEVEL_LABELS = {
  1: '紧凑',
  2: '默认',
  3: '舒适',
  4: '大号',
}

export function getFontClass(level, fallbackLevel = 2) {
  return FONT_LEVEL_CLASSES[level] || FONT_LEVEL_CLASSES[fallbackLevel]
}

export function clampFontLevel(level) {
  const num = Number(level)
  if (Number.isNaN(num)) return 2
  return Math.min(4, Math.max(1, Math.round(num)))
}
