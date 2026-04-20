<script setup lang="ts">
import type { Entry } from '~/composables/useEntries'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HALF_LIFE_HOURS = 5.5
const SLEEP_THRESHOLD_MG = 25
const MAX_DISPLAY_MG = 400

interface DrinkOption { label: string; mg: number }

const DRINKS: DrinkOption[] = [
  { label: 'Espresso (single, 30 ml)', mg: 63 },
  { label: 'Espresso (double, 60 ml)', mg: 126 },
  { label: 'Flat white (2 ristretto shots)', mg: 130 },
  { label: 'Cappuccino / Latte (1 shot)', mg: 63 },
  { label: 'Americano (1 shot)', mg: 63 },
  { label: 'Filter / drip coffee (240 ml)', mg: 95 },
  { label: 'Moka pot (90 ml)', mg: 100 },
  { label: 'Cold brew (240 ml)', mg: 200 },
  { label: 'Instant coffee (240 ml)', mg: 65 },
  { label: 'Black tea (240 ml)', mg: 47 },
  { label: 'Green tea (240 ml)', mg: 28 },
  { label: 'Matcha latte (120 ml)', mg: 70 },
  { label: 'Energy drink — Red Bull (250 ml)', mg: 80 },
  { label: 'Energy drink — Monster (473 ml)', mg: 160 },
  { label: 'Custom', mg: 0 },
]

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, '0'),
  value: String(i).padStart(2, '0'),
}))
const MINUTES = Array.from({ length: 12 }, (_, i) => ({
  label: String(i * 5).padStart(2, '0'),
  value: String(i * 5).padStart(2, '0'),
}))

// ---------------------------------------------------------------------------
// Data / auth
// ---------------------------------------------------------------------------
const { entries, loading, user, add, update, remove, clearToday } = useEntries()

const getClient = () => { try { return useSupabaseClient() } catch { return null } }

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
const now = ref(new Date())
onMounted(() => {
  const d = new Date()
  addHour.value = String(d.getHours()).padStart(2, '0')
  addMinute.value = String(Math.round(d.getMinutes() / 5) * 5 % 60).padStart(2, '0')
  setInterval(() => { now.value = new Date() }, 30_000)
})

// ---------------------------------------------------------------------------
// Add form
// ---------------------------------------------------------------------------
const selectedDrinkLabel = ref(DRINKS[0]!.label)
const selectedDrink = computed(() =>
  DRINKS.find(d => d.label === selectedDrinkLabel.value) ?? DRINKS[0]!
)
const customMg = ref(100)
const addHour = ref('00')
const addMinute = ref('00')

const effectiveMg = computed(() =>
  selectedDrink.value.label === 'Custom' ? customMg.value : selectedDrink.value.mg
)

async function addEntry() {
  const t = new Date(now.value)
  t.setHours(Number(addHour.value), Number(addMinute.value), 0, 0)
  await add({
    drink_label: selectedDrink.value.label,
    mg: effectiveMg.value,
    consumed_at: t.toISOString(),
  })
}

// ---------------------------------------------------------------------------
// Caffeine math
// ---------------------------------------------------------------------------
function caffeineAt(entry: Entry, atDate: Date): number {
  const h = (atDate.getTime() - new Date(entry.consumed_at).getTime()) / 3_600_000
  if (h < 0) return entry.mg // treat just-added or slightly future entries as full dose
  return entry.mg * Math.pow(0.5, h / HALF_LIFE_HOURS)
}

const totalNow = computed(() =>
  entries.value.reduce((sum, e) => sum + caffeineAt(e, now.value), 0)
)

const progressPercent = computed(() =>
  Math.min(100, (totalNow.value / MAX_DISPLAY_MG) * 100)
)

const progressBarClass = computed(() => {
  if (totalNow.value < 50) return 'bg-green-500'
  if (totalNow.value < 150) return 'bg-amber-400'
  return 'bg-red-500'
})

function binarySearchClear(base: number): number {
  let lo = 0, hi = 24 * 3_600_000
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const t = entries.value.reduce((sum, e) => sum + caffeineAt(e, new Date(base + mid)), 0)
    if (t > SLEEP_THRESHOLD_MG) lo = mid
    else hi = mid
  }
  return hi
}

const clearTime = computed((): Date | null => {
  if (totalNow.value <= SLEEP_THRESHOLD_MG) return null
  return new Date(now.value.getTime() + binarySearchClear(now.value.getTime()))
})

const clearTimeLabel = computed(() =>
  clearTime.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? null
)

const hoursUntilClear = computed(() => {
  if (!clearTime.value) return null
  return (clearTime.value.getTime() - now.value.getTime()) / 3_600_000
})

const clearLabel = computed(() => {
  if (hoursUntilClear.value === null) return 'Sleep-safe now'
  const h = Math.floor(hoursUntilClear.value)
  const m = Math.round((hoursUntilClear.value - h) * 60)
  if (h === 0) return `${m}m until sleep-safe`
  if (m === 0) return `${h}h until sleep-safe`
  return `${h}h ${m}m until sleep-safe`
})

const statusIcon = computed(() =>
  hoursUntilClear.value === null ? 'i-lucide-moon' : 'i-lucide-sun'
)

// ---------------------------------------------------------------------------
// Today's log
// ---------------------------------------------------------------------------
const todayEntries = computed(() => {
  const midnight = new Date(now.value)
  midnight.setHours(0, 0, 0, 0)
  return [...entries.value]
    .filter(e => new Date(e.consumed_at) >= midnight)
    .sort((a, b) => new Date(b.consumed_at).getTime() - new Date(a.consumed_at).getTime())
})

function entryTimeLabel(entry: Entry): string {
  return new Date(entry.consumed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function entryCurrentMg(entry: Entry): number {
  return Math.round(caffeineAt(entry, now.value))
}

// ---------------------------------------------------------------------------
// Inline editing
// ---------------------------------------------------------------------------
const editingId = ref<string | null>(null)
const editDrinkLabel = ref('')
const editHour = ref('00')
const editMinute = ref('00')
const editCustomMg = ref(100)

const editEffectiveMg = computed(() =>
  editDrinkLabel.value === 'Custom'
    ? editCustomMg.value
    : DRINKS.find(d => d.label === editDrinkLabel.value)?.mg ?? 0
)

function startEdit(entry: Entry) {
  editingId.value = entry.id
  editDrinkLabel.value = entry.drink_label
  editCustomMg.value = entry.mg
  const d = new Date(entry.consumed_at)
  editHour.value = String(d.getHours()).padStart(2, '0')
  editMinute.value = String(Math.round(d.getMinutes() / 5) * 5 % 60).padStart(2, '0')
}

async function saveEdit(entry: Entry) {
  const t = new Date(entry.consumed_at)
  t.setHours(Number(editHour.value), Number(editMinute.value), 0, 0)
  await update(entry.id, {
    drink_label: editDrinkLabel.value,
    mg: editEffectiveMg.value,
    consumed_at: t.toISOString(),
  })
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const notificationsEnabled = ref(false)
const notificationPermission = ref<NotificationPermission>('default')
let notifiedClear = false

onMounted(() => {
  if ('Notification' in window) {
    notificationPermission.value = Notification.permission
    notificationsEnabled.value = notificationPermission.value === 'granted'
      && localStorage.getItem('kofein-notify') === '1'
  }
})

async function toggleNotifications() {
  if (!('Notification' in window)) return
  if (notificationsEnabled.value) {
    notificationsEnabled.value = false
    localStorage.removeItem('kofein-notify')
    return
  }
  const perm = await Notification.requestPermission()
  notificationPermission.value = perm
  if (perm === 'granted') {
    notificationsEnabled.value = true
    localStorage.setItem('kofein-notify', '1')
  }
}

// Check every minute whether caffeine just dropped below threshold
watch([totalNow, notificationsEnabled], ([mg, enabled]) => {
  if (!enabled) return
  if (mg <= SLEEP_THRESHOLD_MG && !notifiedClear) {
    notifiedClear = true
    new Notification('Kofein ☕', {
      body: 'Caffeine is low — safe to sleep now!',
      icon: '/icon-192.png',
    })
  }
  if (mg > SLEEP_THRESHOLD_MG) notifiedClear = false
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function signOut() {
  const client = getClient()
  if (client) await client.auth.signOut()
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-md mx-auto px-4 py-8 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">kofein ☕</h1>
          <p class="text-xs text-muted">Track caffeine, protect your sleep</p>
        </div>
        <div class="flex items-center gap-2">
          <UIcon
            v-if="loading"
            name="i-lucide-loader-circle"
            class="w-4 h-4 animate-spin text-muted"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="notificationsEnabled ? 'i-lucide-bell' : 'i-lucide-bell-off'"
            :title="notificationsEnabled ? 'Notifications on' : 'Enable notifications'"
            @click="toggleNotifications"
          />
          <UButton
            v-if="user"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-log-out"
            title="Sign out"
            @click="signOut"
          />
          <UButton
            v-else
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-cloud"
            to="/login"
            title="Sign in to sync"
          />
        </div>
      </div>

      <!-- Status card -->
      <UCard>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-2xl font-bold">{{ Math.round(totalNow) }} mg</p>
              <p class="text-sm text-muted">active caffeine</p>
            </div>
            <UIcon :name="statusIcon" class="w-10 h-10 text-primary" />
          </div>

          <!-- Progress bar -->
          <div class="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="progressBarClass"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>

          <!-- Decay chart -->
          <CaffeineChart
            :entries="entries"
            :now="now"
            :threshold="SLEEP_THRESHOLD_MG"
            :half-life-hours="HALF_LIFE_HOURS"
          />

          <div class="flex items-center gap-2">
            <UBadge
              :color="hoursUntilClear === null ? 'success' : 'warning'"
              variant="subtle"
              size="lg"
            >
              {{ clearLabel }}
            </UBadge>
            <span v-if="clearTimeLabel" class="text-sm text-muted">
              ({{ clearTimeLabel }})
            </span>
          </div>
        </div>
      </UCard>

      <!-- Add drink -->
      <UCard>
        <template #header>
          <p class="font-semibold">Add a drink</p>
        </template>

        <div class="space-y-4">
          <USelect
            v-model="selectedDrinkLabel"
            :items="DRINKS.map(d => ({ label: d.label, value: d.label }))"
          />

          <!-- Custom mg input -->
          <UFormField v-if="selectedDrink.label === 'Custom'" label="Caffeine amount (mg)">
            <UInput v-model.number="customMg" type="number" min="1" max="1000" class="w-full" />
          </UFormField>

          <div class="flex items-center gap-2">
            <USelect v-model="addHour" :items="HOURS" class="w-24" />
            <span class="text-muted font-medium">:</span>
            <USelect v-model="addMinute" :items="MINUTES" class="w-24" />
            <UBadge color="neutral" variant="subtle" class="ml-auto whitespace-nowrap">
              {{ effectiveMg }} mg
            </UBadge>
          </div>

          <UButton block icon="i-lucide-plus" :loading="loading" @click="addEntry">
            Add
          </UButton>
        </div>
      </UCard>

      <!-- Today's log -->
      <UCard v-if="todayEntries.length">
        <template #header>
          <div class="flex items-center justify-between">
            <p class="font-semibold">Today</p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              @click="clearToday"
            >
              Clear
            </UButton>
          </div>
        </template>

        <ul class="space-y-3">
          <li v-for="entry in todayEntries" :key="entry.id">
            <!-- View mode -->
            <div v-if="editingId !== entry.id" class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ entry.drink_label }}</p>
                <p class="text-xs text-muted">
                  {{ entryTimeLabel(entry) }} · {{ entry.mg }} mg → {{ entryCurrentMg(entry) }} mg now
                </p>
              </div>
              <div class="flex items-center gap-1">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="startEdit(entry)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="remove(entry.id)" />
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else class="space-y-2 rounded-lg bg-muted/40 p-3">
              <USelect
                v-model="editDrinkLabel"
                :items="DRINKS.map(d => ({ label: d.label, value: d.label }))"
                size="sm"
              />
              <UFormField v-if="editDrinkLabel === 'Custom'" label="Caffeine (mg)">
                <UInput v-model.number="editCustomMg" type="number" min="1" max="1000" size="sm" class="w-full" />
              </UFormField>
              <div class="flex items-center gap-2">
                <USelect v-model="editHour" :items="HOURS" size="sm" class="w-24" />
                <span class="text-muted font-medium">:</span>
                <USelect v-model="editMinute" :items="MINUTES" size="sm" class="w-24" />
                <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">
                  {{ editEffectiveMg }} mg
                </UBadge>
              </div>
              <div class="flex gap-2">
                <UButton size="xs" icon="i-lucide-check" @click="saveEdit(entry)">Save</UButton>
                <UButton size="xs" color="neutral" variant="ghost" @click="cancelEdit">Cancel</UButton>
              </div>
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Sync notice -->
      <p v-if="!user" class="text-center text-xs text-muted">
        <NuxtLink to="/login" class="underline underline-offset-2">Sign in</NuxtLink>
        to sync across devices ·
        Caffeine half-life ~5.5h · Sleep-safe below {{ SLEEP_THRESHOLD_MG }} mg
      </p>
      <p v-else class="text-center text-xs text-muted">
        Synced as {{ user.email }} ·
        Caffeine half-life ~5.5h · Sleep-safe below {{ SLEEP_THRESHOLD_MG }} mg
      </p>

    </div>
  </div>
</template>
