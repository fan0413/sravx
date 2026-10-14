<template>
  <SravxH5GlobalNav />
  <section class="scissor-showcase" aria-labelledby="showcase-title">
    <header class="showcase-info">
      <p class="showcase-brand">SRAVX / TOOL COLLECTION</p>
      <div class="showcase-copy" :key="selected.id">
        <p class="showcase-number">{{ String(activeIndex + 1).padStart(2, '0') }} / {{ String(items.length).padStart(2, '0') }}</p>
        <h1 id="showcase-title">{{ selected.name }}</h1>
        <p class="showcase-description">产品介绍待补充</p>
        <dl><div><dt>适用场景</dt><dd>待补充</dd></div><div><dt>材质参数</dt><dd>待补充</dd></div><div><dt>产品特点</dt><dd>待补充</dd></div></dl>
      </div>
    </header>
    <div class="showcase-presentation" @mouseenter="setHover(true)" @mouseleave="setHover(false)" @focusin="setFocus(true)" @focusout="onFocusOut">
      <div ref="viewport" class="showcase-viewport" :class="{ 'is-dragging': dragging }" role="region" aria-roledescription="轮播" aria-label="剪刀斜向景深循环展示，可鼠标拖动或左右方向键切换"
        tabindex="0" @keydown="onKey" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerCancel" @lostpointercapture="onPointerCancel" @click.capture="onViewportClick"
        @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd" @touchcancel="onTouchCancel">
        <component :is="'button'" v-for="(item, index) in items" :key="item.id" class="showcase-item"
          :style="itemStyle(index)" :aria-label="'展示' + item.name" :aria-pressed="index === activeIndex"
          :tabindex="index === activeIndex ? 0 : -1" @click="selectItem(index)">
          <img :src="imageSource(item)" :alt="item.name" draggable="false" decoding="async" @error="failedImages[item.id] = true">
          <span v-if="failedImages[item.id]" class="showcase-image-error">图片暂不可用</span>
        </component>
      </div>
      <div class="showcase-product-label"><span>正在展示 · {{ String(activeIndex + 1).padStart(2, '0') }} / 04</span><strong>{{ selected.name }}</strong></div>
      <div class="showcase-controls">
        <component :is="'button'" class="showcase-arrow" aria-label="上一把剪刀" @click="step(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></component>
        <div class="showcase-dots" aria-label="选择展示剪刀"><component :is="'button'" v-for="(item, index) in items" :key="item.id" class="showcase-dot" :aria-label="item.name" :aria-pressed="index === activeIndex" :class="{ selected: index === activeIndex }" @click="selectItem(index)"></component></div>
        <component :is="'button'" class="showcase-arrow" aria-label="下一把剪刀" @click="step(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></component>
        <component :is="'button'" class="showcase-play" :aria-label="paused ? '播放自动展示' : '暂停自动展示'" :aria-pressed="paused" @click="togglePlayback">
          <svg v-if="paused" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
        </component>
      </div>
      <p class="showcase-hint">{{ paused ? '已暂停' : '自动循环' }} · 鼠标拖动、滚轮或左右滑动切换</p>
      <p class="showcase-current" aria-live="polite">{{ paused || hovering || focused ? selected.name : '' }}</p>
    </div>
    <footer class="showcase-entry">
      <component :is="'button'" class="showcase-catalog" @click="$emit('catalog')">进入官网 <span aria-hidden="true">↗</span></component>
      <p>素材展示 · 信息暂为占位</p>
    </footer>
  </section>
</template>

<script>
import { showcaseScissors, wrapIndex, horizontalPosition, swipeDirection } from '../common/scissor-orbit.mjs'
import SravxH5GlobalNav from './SravxH5GlobalNav.vue'
export default {
  components: { SravxH5GlobalNav },
  emits: ['catalog'],
  data() { return { items: showcaseScissors, rotation: 0, displayRotation: 0, viewportWidth: 1000, touchStart: null, dragStart: null, dragging: false, lastWheelAt: 0, failedImages: {}, paused: false, hovering: false, focused: false, reducedMotion: false } },
  computed: {
    activeIndex() { return wrapIndex(Math.round(this.displayRotation), this.items.length) },
    selected() { return this.items[this.activeIndex] }
  },
  watch: { rotation(target) { this.animateRotation(target) } },
  mounted() {
    this.viewportElement = this.$refs.viewport
    this.viewportElement.addEventListener('wheel', this.onWheel, { passive: false })
    this.resizeHandler = () => { this.viewportWidth = this.viewportElement.clientWidth }
    this.resizeHandler()
    this.resizeObserver = new ResizeObserver(this.resizeHandler)
    this.resizeObserver.observe(this.viewportElement)
    this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motionHandler = () => {
      this.reducedMotion = this.motionPreference.matches
      if (this.reducedMotion) { this.paused = true; cancelAnimationFrame(this.rotationFrame); this.displayRotation = this.rotation }
      this.schedulePlayback()
    }
    this.motionPreference.addEventListener('change', this.motionHandler)
    this.visibilityHandler = () => this.schedulePlayback()
    document.addEventListener('visibilitychange', this.visibilityHandler)
    this.motionHandler()
  },
  beforeUnmount() {
    this.disposed = true
    clearTimeout(this.playbackTimer)
    clearTimeout(this.clickResetTimer)
    cancelAnimationFrame(this.rotationFrame)
    this.motionPreference?.removeEventListener('change', this.motionHandler)
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    this.viewportElement?.removeEventListener('wheel', this.onWheel)
    this.resizeObserver?.disconnect()
  },
  methods: {
    imageSource(item) { return import.meta.env.DEV ? '/public' + item.image : item.image },
    itemStyle(index) {
      const p = horizontalPosition(index, this.displayRotation, this.items.length, this.viewportWidth)
      return { transform: `translate(-50%, -50%) translate3d(${p.x}px, ${p.y}px, 0) rotateY(${p.yaw}deg) rotate(${p.tilt}deg) scale(${p.scale})`, opacity: p.opacity, zIndex: p.layer, visibility: p.opacity === 0 ? 'hidden' : 'visible' }
    },
    animateRotation(target) {
      cancelAnimationFrame(this.rotationFrame)
      if (this.reducedMotion) { this.displayRotation = target; return }
      const from = this.displayRotation, start = performance.now()
      const frame = now => {
        const progress = Math.min(1, (now - start) / 1000)
        const eased = progress * progress * (3 - 2 * progress)
        this.displayRotation = from + (target - from) * eased
        if (progress < 1) this.rotationFrame = requestAnimationFrame(frame)
      }
      this.rotationFrame = requestAnimationFrame(frame)
    },
    schedulePlayback() {
      clearTimeout(this.playbackTimer)
      if (this.disposed || this.paused || this.hovering || this.focused || this.dragStart || document.hidden) return
      this.playbackTimer = setTimeout(() => { this.rotation += 1; this.schedulePlayback() }, 4500)
    },
    setHover(value) { this.hovering = value; this.schedulePlayback() },
    setFocus(value) { this.focused = value; this.schedulePlayback() },
    onFocusOut(event) { if (!event.currentTarget.contains(event.relatedTarget)) this.setFocus(false) },
    onPointerDown(event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      clearTimeout(this.clickResetTimer)
      this.suppressClick = false
      cancelAnimationFrame(this.rotationFrame)
      this.dragStart = { id: event.pointerId, x: event.clientX, y: event.clientY, phase: this.displayRotation, target: this.rotation }
      this.schedulePlayback()
    },
    onPointerMove(event) {
      const start = this.dragStart
      if (!start || event.pointerId !== start.id) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (!this.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.dragging = true
        this.viewportElement.setPointerCapture(event.pointerId)
      }
      if (!this.dragging) return
      event.preventDefault()
      this.suppressClick = true
      this.displayRotation = start.phase + Math.max(-1, Math.min(1, dx / (this.viewportWidth * .21)))
    },
    onPointerUp(event) { this.finishDrag(event, false) },
    onPointerCancel(event) { this.finishDrag(event, true) },
    finishDrag(event, cancelled) {
      const start = this.dragStart
      if (!start || event.pointerId !== start.id) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      const switchTool = !cancelled && this.dragging && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2
      const target = switchTool ? Math.round(start.phase) + Math.sign(dx) : start.target
      this.dragStart = null
      this.dragging = false
      if (this.viewportElement.hasPointerCapture(start.id)) this.viewportElement.releasePointerCapture(start.id)
      if (target === this.rotation) this.animateRotation(target)
      else this.rotation = target
      this.clickResetTimer = setTimeout(() => { this.suppressClick = false }, 0)
      this.schedulePlayback()
    },
    onViewportClick(event) { if (this.suppressClick) { event.preventDefault(); event.stopPropagation() } },
    togglePlayback() { this.paused = !this.paused; this.schedulePlayback() },
    step(direction) { this.rotation += direction; this.schedulePlayback() },
    selectItem(index) {
      // Forward-only dot selection keeps left-to-right motion across the seam.
      this.rotation += wrapIndex(index - wrapIndex(this.rotation, this.items.length), this.items.length)
      this.schedulePlayback()
    },
    onWheel(event) {
      if (event.ctrlKey || this.dragStart) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (Math.abs(delta) < 8) return
      if (event.cancelable) event.preventDefault()
      const now = Date.now()
      if (now - this.lastWheelAt < 600) return
      this.lastWheelAt = now
      this.step(Math.sign(delta))
    },
    onKey(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); this.step(event.key === 'ArrowRight' ? 1 : -1) }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); this.selectItem(event.key === 'Home' ? 0 : this.items.length - 1) }
    },
    onTouchStart(event) { this.setHover(true); this.touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null },
    onTouchCancel() { this.touchStart = null; this.setHover(false) },
    onTouchEnd(event) {
      const start = this.touchStart; this.touchStart = null; this.setHover(false)
      if (!start || !event.changedTouches.length) return
      const touch = event.changedTouches[0], direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y)
      if (direction) this.step(direction)
    }
  }
}
</script>

<style scoped>
.scissor-showcase{--showcase-ink:#1d1d1f;--showcase-muted:#86868b;position:relative;box-sizing:border-box;min-height:calc(100vh - 48px);min-height:calc(100svh - 48px);display:flex;flex-direction:column;overflow:hidden;background:#fff;color:var(--showcase-ink);font-family:inherit;padding:42px 5vw max(22px,env(safe-area-inset-bottom))}
.scissor-showcase{isolation:isolate;z-index:0}
.showcase-info{position:relative;z-index:30;width:min(360px,100%);pointer-events:none}
.showcase-brand{margin:0 0 26px;font-size:11px;font-weight:600;letter-spacing:.2em;color:var(--showcase-muted)}
.showcase-number{font-size:11px;letter-spacing:.15em;color:var(--showcase-muted);margin:0 0 12px}
.showcase-info h1{margin:0;font-size:clamp(26px,3vw,42px);font-weight:600;letter-spacing:-.025em}
.showcase-description{margin:16px 0 20px;color:var(--showcase-muted);font-size:14px}
.showcase-info dl{margin:0;font-size:12px;line-height:1.9}
.showcase-info dl div{display:flex;gap:24px}.showcase-info dt{color:#6e6e73}.showcase-info dd{margin:0;color:#a2a2a7}
.showcase-copy{overflow:hidden}.showcase-copy>*,.showcase-copy dl div{animation:copy-unfold .65s cubic-bezier(.22,1,.36,1) both}.showcase-copy h1{animation-delay:.07s}.showcase-copy .showcase-description{animation-delay:.14s}.showcase-copy dl{animation-delay:.2s}.showcase-copy dl div:nth-child(2){animation-delay:.08s}.showcase-copy dl div:nth-child(3){animation-delay:.16s}
.showcase-presentation{position:relative;flex:1;min-width:0;width:100%;margin-top:-110px;padding-top:120px}
.showcase-viewport{height:clamp(400px,46svh,650px);position:relative;overflow:hidden;perspective:1600px;isolation:isolate;touch-action:pan-y;outline-offset:-6px;cursor:grab;user-select:none}.showcase-viewport.is-dragging,.showcase-viewport.is-dragging .showcase-item{cursor:grabbing}
.showcase-item{position:absolute;top:59%;left:50%;width:350px;height:clamp(270px,31svh,360px);padding:0!important;margin:0!important;border:0;border-radius:0;background:none!important;cursor:pointer;will-change:transform;transform-origin:center;line-height:normal;font-family:inherit}
.showcase-item img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 16px 12px rgba(29,29,31,.08));pointer-events:none;user-select:none}
.showcase-item::after,.showcase-catalog::after,.showcase-arrow::after,.showcase-dot::after,.showcase-play::after{border:0!important}
.showcase-controls{position:relative;z-index:30;display:flex;align-items:center;justify-content:center;gap:20px;margin-top:24px}
.showcase-arrow,.showcase-play{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;padding:0!important;margin:0!important;border:0;background:#f5f5f7!important;color:#6e6e73;cursor:pointer;line-height:normal}
.showcase-arrow svg,.showcase-play svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.showcase-dots{display:flex;gap:5px}.showcase-dot{display:flex;align-items:center;justify-content:center;width:25px;height:32px;padding:0!important;margin:0!important;border:0;background:none!important;cursor:pointer;line-height:normal}
.showcase-dot::before{content:'';width:5px;height:5px;border-radius:50%;background:#c6c6cb}.showcase-dot.selected::before{width:19px;border-radius:4px;background:#1d1d1f}
.showcase-hint{margin:14px 0 0;text-align:center;font-size:11px;color:var(--showcase-muted)}
.showcase-product-label{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin:10px 0 0}.showcase-product-label span{font-size:10px;letter-spacing:.13em;color:var(--showcase-muted)}.showcase-product-label strong{font-size:21px;font-weight:600;letter-spacing:-.02em}
.showcase-current{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%)}
.showcase-entry{position:relative;z-index:30;text-align:center;margin-top:auto;padding-top:26px}.showcase-entry p{margin:14px 0 0;font-size:11px;color:var(--showcase-muted)}
.showcase-catalog{display:inline-flex;align-items:center;gap:22px;margin:0!important;padding:13px 24px!important;border:0;border-radius:999px;background:#0071e3!important;color:#fff;font-size:14px;line-height:normal;font-family:inherit;cursor:pointer}
.showcase-image-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--showcase-muted)}
button:focus-visible,.showcase-viewport:focus-visible{outline:2px solid #0071e3;outline-offset:4px}
@keyframes copy-unfold{from{opacity:0;transform:translateY(18px);clip-path:inset(0 0 100% 0)}to{opacity:1;transform:translateY(0);clip-path:inset(0 0 0 0)}}
@media(max-width:700px){.scissor-showcase{padding:24px 22px max(22px,env(safe-area-inset-bottom))}.showcase-brand{margin-bottom:18px;font-size:10px}.showcase-info h1{font-size:28px}.showcase-description{margin:12px 0}.showcase-info dl{display:flex;flex-wrap:wrap;gap:0 16px;font-size:10px}.showcase-info dl div{gap:8px}.showcase-presentation{margin-top:20px;padding-top:0}.showcase-viewport{height:clamp(310px,43svh,410px);margin:0 -22px}.showcase-item{width:180px;height:clamp(170px,23svh,210px)}.showcase-controls{margin-top:10px;gap:16px}.showcase-entry{padding-top:28px}}
@media(prefers-reduced-motion:reduce){.showcase-copy>*,.showcase-copy dl div{animation:none}}
</style>
