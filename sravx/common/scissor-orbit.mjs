// Local presentation only: these assets do not represent purchasable SKUs.
export const showcaseScissors = [
  { id: 'fishbone-7', name: '7.0寸鱼骨剪', detail: '细看刀身、齿型与握柄细节。', image: '/official/orbit/fishbone-7.png', orientation: 'upright' },
  { id: 'curve-6-5', name: '6.5寸小弯剪', detail: '细看刀身曲线与握柄细节。', image: '/official/orbit/curve-6-5.png', orientation: 'upright' },
  { id: 'fluffy-7', name: '7.0寸蓬蓬剪', detail: '细看刀身、齿型与握柄细节。', image: '/official/orbit/fluffy-7.png', orientation: 'upright' },
  { id: 'natural-7', name: '7.0寸弯自然剪', detail: '观察弯形刀身与齿刃结构。', image: '/official/orbit/natural-7.png', orientation: 'upright' }
]

export function wrapIndex(index, count) { return ((index % count) + count) % count }

// A diagonal perspective conveyor: tools grow as they travel left-bottom to right-top.
// The selected tool occupies the center; neighboring tools retain diagonal depth.
export function horizontalPosition(index, phase, count, width = 1000) {
  const distance = wrapIndex(phase - index + count / 2 + .5, count) - count / 2
  const depth = (distance + count / 2) / count
  const edgeFade = Math.min(1, Math.max(0, (count / 2 - Math.abs(distance)) / .3))
  const focus = Math.max(0, 1 - Math.abs(distance - .5))
  return { x: (distance - .5) * width * .21, y: -distance * (width < 600 ? 42 : 72), scale: .48 + depth * .7 + focus * .48, opacity: edgeFade * (.45 + focus * .55), layer: Math.round(depth * 40 + focus * 30) + 1, tilt: 22, yaw: -18 + depth * 12 }
}

// Elliptical projection of a tilted 3D orbit. Images stay facing the reader.
export function orbitPosition(index, rotation, count, compact = false) {
  const angle = (index - rotation) * Math.PI * 2 / count
  const depth = Math.cos(angle)
  const x = Math.sin(angle) * (compact ? 95 : 265)
  const y = depth * (compact ? 68 : 105) - x * 0.28
  return { x, y, z: depth * 85, scale: 0.42 + (depth + 1) * 0.38, opacity: 0.15 + (depth + 1) * 0.425, layer: Math.round((depth + 1) * 20) + 1 }
}

export function orbitRectsOverlap(word, image, gap = 12) {
  return word.left < image.right + gap && word.right > image.left - gap && word.top < image.bottom + gap && word.bottom > image.top - gap
}

// Text and scissors share the same projection; the word follows its tangent.
export function orbitWordPosition(index, rotation, count, compact = false) {
  const position = orbitPosition(index, rotation, count, compact)
  const angle = (index - rotation) * Math.PI * 2 / count
  const dx = Math.cos(angle) * (compact ? 95 : 265)
  const dy = -Math.sin(angle) * (compact ? 68 : 105) - dx * .28
  let tilt = Math.atan2(dy, dx) * 180 / Math.PI
  if (tilt > 90) tilt -= 180
  if (tilt < -90) tilt += 180
  return { ...position, tilt }
}

export function swipeDirection(dx, dy) {
  if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0
  return dx < 0 ? 1 : -1
}

export function wheelStep({ deltaX = 0, deltaY = 0, ctrlKey = false, deltaMode = 0 }, index, count) {
  if (ctrlKey) return 0 // Never intercept browser pinch-to-zoom.
  const delta = (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY) * (deltaMode === 1 ? 16 : 1)
  if (Math.abs(delta) < 8) return 0
  const direction = Math.sign(delta)
  // Vertical scrolling at either end leaves the carousel instead of trapping the page.
  if (direction < 0 && index === 0 || direction > 0 && index === count - 1) return 0
  return direction
}
