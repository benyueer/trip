// 每天对应的主题色，避开了蓝色（河流）和橙色（边境）
export const DAY_COLORS = [
  { bg: '#ede9fe', text: '#8b5cf6', border: '#ddd6fe' }, // Violet (紫罗兰)
  { bg: '#d1fae5', text: '#10b981', border: '#a7f3d0' }, // Emerald (祖母绿)
  { bg: '#ffe4e6', text: '#f43f5e', border: '#fecdd3' }, // Rose (玫瑰红)
  { bg: '#fae8ff', text: '#d946ef', border: '#f5d0fe' }, // Fuchsia (洋红)
  { bg: '#ecfccb', text: '#84cc16', border: '#d9f99d' }, // Lime (青柠)
  { bg: '#fee2e2', text: '#ef4444', border: '#fecaca' }, // Red (红色)
  { bg: '#fdf2f8', text: '#ec4899', border: '#fbcfe8' }, // Pink (粉色)
]

// 根据 dayIndex 获取主题色（1-based）
export function getDayColor(dayIndex: number) {
  return DAY_COLORS[(dayIndex - 1) % DAY_COLORS.length]
}
