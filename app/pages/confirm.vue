<script setup lang="ts">
definePageMeta({ auth: false })

const supabase = useSupabaseClient()
const router = useRouter()

// The Supabase client detects the session from the URL hash automatically.
// We just need to wait for it and then redirect.
onMounted(async () => {
  // Give the client a moment to parse the hash and set the session
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      subscription.unsubscribe()
      router.push('/')
    }
  })

  // Fallback: if already signed in (e.g. page refresh), redirect immediately
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    subscription.unsubscribe()
    router.push('/')
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-3">
      <UIcon name="i-lucide-loader-circle" class="w-8 h-8 animate-spin text-primary mx-auto" />
      <p class="text-sm text-muted">Signing you in…</p>
    </div>
  </div>
</template>
