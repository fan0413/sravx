import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { showcaseScissors, wrapIndex, orbitPosition, orbitWordPosition, orbitRectsOverlap, swipeDirection, wheelStep, horizontalPosition } from '../common/scissor-orbit.mjs'

test('carousel indexes wrap in both directions', () => {
  assert.equal(wrapIndex(-1, 5), 4)
  assert.equal(wrapIndex(5, 5), 0)
  assert.equal(wrapIndex(501, 5), 1)
})
test('selected scissor is in front, larger and brighter than the rear items', () => {
  const front = orbitPosition(0, 0, 5), rear = orbitPosition(2, 0, 5)
  assert.equal(front.x, 0)
  assert.ok(front.z > rear.z && front.scale > rear.scale && front.opacity > rear.opacity)
  assert.ok(front.layer > rear.layer)
})
test('full rotations and mobile layout preserve the tilted ring geometry', () => {
  const original = orbitPosition(1, 0, 5), fullTurn = orbitPosition(1, 5, 5), mobile = orbitPosition(1, 0, 5, true)
  assert.ok(Math.abs(original.x - fullTurn.x) < .0001)
  assert.ok(Math.abs(original.y - fullTurn.y) < .0001)
  assert.ok(Math.abs(mobile.x) < Math.abs(original.x))
})
test('horizontal swipes switch while vertical scrolling and taps do not', () => {
  assert.equal(swipeDirection(-90, 10), 1)
  assert.equal(swipeDirection(90, 10), -1)
  assert.equal(swipeDirection(10, 90), 0)
  assert.equal(swipeDirection(30, 5), 0)
})

test('repeated brand words follow the scissor orbit and remain readable', () => {
  for (const compact of [false, true]) {
    for (let index = 0; index < 5; index += .2) {
      const word = orbitWordPosition(index, 2, 5, compact)
      const scissor = orbitPosition(index, 2, 5, compact)
      for (const key of ['x', 'y', 'z', 'scale', 'opacity', 'layer']) assert.equal(word[key], scissor[key])
      assert.ok(word.tilt >= -90 && word.tilt <= 90)
    }
  }
})

test('incoming scissors grow continuously and become solid at the front', () => {
  const phases = [0, .25, .5, .75, 1].map(rotation => orbitPosition(1, rotation, 5))
  for (let i = 1; i < phases.length; i++) {
    assert.ok(phases[i].scale > phases[i - 1].scale)
    assert.ok(phases[i].opacity > phases[i - 1].opacity)
  }
  assert.equal(phases.at(-1).x, 0)
  assert.equal(phases.at(-1).opacity, 1)
  assert.ok(phases.at(-1).scale > 1.15)
})

test('brand words reserve a padded gap around image bounds', () => {
  const image = { left: 100, right: 200, top: 100, bottom: 300 }
  assert.equal(orbitRectsOverlap({ left: 205, right: 235, top: 120, bottom: 135 }, image), true)
  assert.equal(orbitRectsOverlap({ left: 213, right: 243, top: 120, bottom: 135 }, image), false)
  assert.equal(orbitRectsOverlap({ left: 80, right: 130, top: 288, bottom: 310 }, image), true)
})
test('wheel leaves the carousel at the ends and does not intercept zoom', () => {
  assert.equal(wheelStep({ deltaY: 60 }, 0, 5), 1)
  assert.equal(wheelStep({ deltaY: -60 }, 0, 5), 0)
  assert.equal(wheelStep({ deltaY: 60 }, 4, 5), 0)
  assert.equal(wheelStep({ deltaY: -60 }, 4, 5), -1)
  assert.equal(wheelStep({ deltaY: 60, ctrlKey: true }, 2, 5), 0)
  assert.equal(wheelStep({ deltaY: .5 }, 2, 5), 0)
  assert.equal(wheelStep({ deltaY: 1, deltaMode: 1 }, 2, 5), 1)
})
test('curated materials exist, stay in H5 public assets, and have no SKU or pricing', () => {
  assert.equal(showcaseScissors.length, 4)
  assert.deepEqual(showcaseScissors.map(item => item.name), ['7.0寸鱼骨剪', '6.5寸小弯剪', '7.0寸蓬蓬剪', '7.0寸弯自然剪'])
  for (const item of showcaseScissors) {
    assert.ok(existsSync(new URL('../public' + item.image, import.meta.url)))
    assert.equal(item.price, undefined)
    assert.equal(item.productId, undefined)
    assert.equal(item.orientation, 'upright')
  }
})
test('component is H5-only, with cleanup, reduced motion and no order or API calls', () => {
  const page = readFileSync(new URL('../pages/index/index.vue', import.meta.url), 'utf8')
  assert.match(page, /#ifdef H5/)
  const component = readFileSync(new URL('../components/ScissorOrbitH5.vue', import.meta.url), 'utf8')
  const parent = readFileSync(new URL('../components/SravxOfficialH5.vue', import.meta.url), 'utf8')
  const welcome = readFileSync(new URL('../pages/welcome/index.vue', import.meta.url), 'utf8')
  assert.match(welcome, /\/\/ #ifdef H5\s+import ScissorOrbitH5/)
  assert.match(welcome, /<!-- #ifdef H5 -->\s+<ScissorOrbitH5/)
  assert.doesNotMatch(welcome, /start-landing|SravxOfficialH5/)
  assert.doesNotMatch(parent, /ScissorOrbitH5/)
  assert.match(welcome, /uni\.reLaunch\(\{ url: '\/pages\/index\/index' \}\)/)
  assert.match(component, /removeEventListener\('wheel'/)
  assert.match(component, /resizeObserver\?\.disconnect/)
  assert.match(component, /prefers-reduced-motion:reduce/)
  assert.match(component, /touch-action:pan-y/)
  assert.doesNotMatch(component, /orbit-track|orbit-intro/)
  assert.doesNotMatch(component, /orbit-axis/)
  assert.doesNotMatch(component, /class="orbit-word"/)
  assert.match(component, /class="showcase-entry"/)
  assert.match(component, /class="showcase-info"/)
  assert.match(component, /产品介绍待补充/)
  assert.match(component, /clearTimeout\(this.playbackTimer\)/)
  assert.match(component, /document\.removeEventListener\('visibilitychange'/)
  assert.doesNotMatch(component, /uni\.request|fetch\(|callFunction|createOrder|setInterval/)
})

test('diagonal sequence travels right and up, grows towards the front, and wraps invisibly', () => {
  const phases = [0, .25, .5, .75, 1].map(phase => horizontalPosition(1, phase, 4, 1000))
  for (let index = 1; index < phases.length; index++) {
    assert.ok(phases[index].x > phases[index - 1].x)
    assert.ok(phases[index].y < phases[index - 1].y)
    assert.ok(phases[index].scale > phases[index - 1].scale)
  }
  assert.equal(phases.at(-1).opacity, 1)
  assert.deepEqual(horizontalPosition(0, 0, 4), horizontalPosition(0, 4, 4))
  assert.equal(horizontalPosition(0, 1.5, 4).opacity, 0)
  assert.ok(horizontalPosition(0, 1.499, 4).opacity < .01)
  assert.ok(horizontalPosition(0, 1.501, 4).opacity < .01)
  const current = horizontalPosition(0, 0, 4)
  assert.equal(current.x, 0)
  assert.equal(current.opacity, 1)
  for (let index = 1; index < 4; index++) {
    const side = horizontalPosition(index, 0, 4)
    assert.ok(side.opacity < current.opacity && side.scale < current.scale && side.layer < current.layer)
  }
  assert.ok(Math.abs(horizontalPosition(1, 0, 4, 390).x) < Math.abs(phases[0].x))
})

test('showcase reuses brand navigation, supports captured mouse drag and unfolding copy', () => {
  const source = readFileSync(new URL('../components/ScissorOrbitH5.vue', import.meta.url), 'utf8')
  assert.match(source, /<SravxH5GlobalNav/)
  assert.match(source, /setPointerCapture/)
  assert.match(source, /@pointercancel="onPointerCancel"/)
  assert.match(source, /@lostpointercapture="onPointerCancel"/)
  assert.match(source, /event\.pointerType !== 'mouse'/)
  assert.match(source, /@click\.capture="onViewportClick"/)
  assert.match(source, /class="showcase-product-label"/)
  assert.match(source, /copy-unfold/)
})
