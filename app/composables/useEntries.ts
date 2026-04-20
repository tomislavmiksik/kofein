export interface Entry {
  id: string
  drink_label: string
  mg: number
  consumed_at: string // ISO string
}

const STORAGE_KEY = 'kofein-entries'

export function useEntries() {
  const entries = ref<Entry[]>([])
  const loading = ref(false)

  // Call composables once during setup — not inside async functions
  let client: ReturnType<typeof useSupabaseClient> | null = null
  let user: ReturnType<typeof useSupabaseUser> | Ref<null>
  try {
    client = useSupabaseClient()
    user = useSupabaseUser()
  } catch {
    user = ref(null)
  }

  async function load() {
    // Show cached entries immediately — no blank screen
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) entries.value = JSON.parse(raw)

    // Then sync from Supabase in the background
    if (client && user.value) {
      loading.value = true
      const since = new Date(Date.now() - 48 * 3_600_000).toISOString()
      const { data } = await client
        .from('entries')
        .select('*')
        .gte('consumed_at', since)
        .order('consumed_at', { ascending: false })
      if (data) {
        entries.value = data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
      loading.value = false
    }
  }

  async function add(entry: Omit<Entry, 'id'>) {
    if (client && user.value) {
      const { data: { session } } = await client.auth.getSession()
      if (!session) {
        entries.value.unshift({ ...entry, id: crypto.randomUUID() })
        persist()
        return
      }
      const { data } = await client
        .from('entries')
        .insert({ ...entry, user_id: session.user.id })
        .select()
        .single()
      if (data) entries.value.unshift(data)
    } else {
      entries.value.unshift({ ...entry, id: crypto.randomUUID() })
      persist()
    }
  }

  async function update(id: string, patch: Partial<Omit<Entry, 'id'>>) {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return
    Object.assign(entries.value[idx]!, patch)

    if (client && user.value) {
      await client.from('entries').update(patch).eq('id', id)
    } else {
      persist()
    }
  }

  async function remove(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)

    if (client && user.value) {
      await client.from('entries').delete().eq('id', id)
    } else {
      persist()
    }
  }

  async function clearToday() {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const todayIds = entries.value
      .filter(e => new Date(e.consumed_at) >= midnight)
      .map(e => e.id)
    entries.value = entries.value.filter(e => !todayIds.includes(e.id))

    if (client && user.value) {
      await client.from('entries').delete().in('id', todayIds)
    } else {
      persist()
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
  }

  // Migrate localStorage → Supabase on sign-in
  if (client) {
    watch(user, async (u) => {
      if (u) {
        const raw = localStorage.getItem(STORAGE_KEY)
        const local: Entry[] = raw ? JSON.parse(raw) : []
        if (local.length) {
          await client!.from('entries').upsert(
            local.map(e => ({ ...e, user_id: u.id }))
          )
          localStorage.removeItem(STORAGE_KEY)
        }
      }
      await load()
    })
  }

  onMounted(load)

  return { entries, loading, user, add, update, remove, clearToday }
}
