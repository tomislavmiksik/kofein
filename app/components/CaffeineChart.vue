<script setup lang="ts">
interface Entry {
  id: string
  mg: number
  consumed_at: string
}

const props = defineProps<{
  entries: Entry[]
  now: Date
  threshold: number
  halfLifeHours: number
}>()

// SVG layout
const W = 360
const H = 160
const ML = 36
const MR = 16
const MT = 16
const MB = 28
const PW = W - ML - MR
const PH = H - MT - MB

function caffeineAt(entry: Entry, t: Date): number {
  const h = (t.getTime() - new Date(entry.consumed_at).getTime()) / 3_600_000
  if (h < 0) return 0
  return entry.mg * Math.pow(0.5, h / props.halfLifeHours)
}

function totalAt(t: Date): number {
  return props.entries.reduce((sum, e) => sum + caffeineAt(e, t), 0)
}

// X: from first entry (or now-1h) to clearTime+1h (or now+4h)
const xMin = computed(() => {
  if (!props.entries.length) return props.now.getTime() - 1 * 3_600_000
  const earliest = Math.min(...props.entries.map(e => new Date(e.consumed_at).getTime()))
  // Don't go back more than 12h — keeps the chart readable day-to-day
  const cap = props.now.getTime() - 12 * 3_600_000
  return Math.max(earliest - 15 * 60_000, cap)
})

const xMax = computed(() => {
  const base = props.now.getTime()
  const total = totalAt(props.now)
  if (total <= props.threshold) return base + 4 * 3_600_000
  let lo = 0, hi = 24 * 3_600_000
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (totalAt(new Date(base + mid)) > props.threshold) lo = mid
    else hi = mid
  }
  return base + hi + 1 * 3_600_000
})

const yMax = computed(() => {
  // Sample peak across the range
  const steps = 60
  const step = (xMax.value - xMin.value) / steps
  let peak = 0
  for (let i = 0; i <= steps; i++) {
    const v = totalAt(new Date(xMin.value + i * step))
    if (v > peak) peak = v
  }
  return Math.max(peak * 1.25, props.threshold * 2.5, 50)
})

function toX(ms: number): number {
  return ML + ((ms - xMin.value) / (xMax.value - xMin.value)) * PW
}

function toY(mg: number): number {
  return MT + PH - (mg / yMax.value) * PH
}

// Sample every 10 minutes
const STEPS = 200
const curvePath = computed(() => {
  if (!props.entries.length) return ''
  const step = (xMax.value - xMin.value) / STEPS
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = new Date(xMin.value + i * step)
    return `${i === 0 ? 'M' : 'L'}${toX(t.getTime()).toFixed(1)},${toY(totalAt(t)).toFixed(1)}`
  }).join(' ')
})

const curveAreaPath = computed(() => {
  if (!props.entries.length) return ''
  const step = (xMax.value - xMin.value) / STEPS
  const bottom = (MT + PH).toFixed(1)
  const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = new Date(xMin.value + i * step)
    return `${toX(t.getTime()).toFixed(1)},${toY(totalAt(t)).toFixed(1)}`
  })
  return `M${pts[0]} L${pts.slice(1).join(' L')} L${toX(xMax.value).toFixed(1)},${bottom} L${toX(xMin.value).toFixed(1)},${bottom} Z`
})

// Time labels — pick 3-5 clean hour marks
const timeLabels = computed(() => {
  const rangeH = (xMax.value - xMin.value) / 3_600_000
  const stepH = rangeH > 16 ? 4 : rangeH > 8 ? 2 : 1
  const labels: { x: number; label: string }[] = []
  const start = new Date(xMin.value)
  start.setMinutes(0, 0, 0)
  let t = start.getTime()
  while (t <= xMax.value) {
    const x = toX(t)
    if (x >= ML + 4 && x <= W - MR - 4) {
      labels.push({ x, label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    }
    t += stepH * 3_600_000
  }
  return labels
})

const nowX = computed(() => toX(props.now.getTime()))
const thresholdY = computed(() => toY(props.threshold))
const plotBottom = computed(() => MT + PH)
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" style="overflow:visible" aria-hidden="true">
    <!-- Area under curve -->
    <path v-if="curveAreaPath" :d="curveAreaPath" class="fill-amber-400/15" />

    <!-- Sleep-safe zone below threshold -->
    <rect
      :x="ML" :y="thresholdY"
      :width="PW" :height="plotBottom - thresholdY"
      class="fill-green-500/10"
    />

    <!-- Threshold dashed line -->
    <line
      :x1="ML" :y1="thresholdY" :x2="W - MR" :y2="thresholdY"
      class="stroke-green-500" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"
    />

    <!-- Caffeine curve -->
    <path
      v-if="curvePath"
      :d="curvePath"
      fill="none"
      class="stroke-amber-400"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- Now marker -->
    <line
      :x1="nowX" :y1="MT" :x2="nowX" :y2="plotBottom"
      class="stroke-primary" stroke-width="1.5" opacity="0.5"
    />

    <!-- Axes -->
    <line :x1="ML" :y1="MT" :x2="ML" :y2="plotBottom" stroke="currentColor" stroke-width="1" opacity="0.12" />
    <line :x1="ML" :y1="plotBottom" :x2="W - MR" :y2="plotBottom" stroke="currentColor" stroke-width="1" opacity="0.12" />

    <!-- Time labels -->
    <text
      v-for="lbl in timeLabels" :key="lbl.label"
      :x="lbl.x" :y="plotBottom + 16"
      text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5"
    >{{ lbl.label }}</text>

    <!-- Threshold label -->
    <text
      :x="ML - 4" :y="thresholdY + 3"
      text-anchor="end" font-size="9" class="fill-green-500" opacity="0.9"
    >{{ threshold }}</text>

    <!-- "now" label -->
    <text
      :x="nowX" :y="MT - 4"
      text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5"
    >now</text>
  </svg>
</template>
