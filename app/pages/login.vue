<script setup lang="ts">
definePageMeta({ auth: false })

const supabase = useSupabaseClient()
const email = ref('')
const sent = ref(false)
const loading = ref(false)
const error = ref('')

async function signIn() {
  error.value = ''
  loading.value = true
  const { error: err } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: { emailRedirectTo: `${window.location.origin}/confirm` },
  })
  loading.value = false
  if (err) error.value = err.message
  else sent.value = true
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="text-center space-y-1">
          <h1 class="text-xl font-bold">Sign in to kofein ☕</h1>
          <p class="text-sm text-muted">Sync your data across devices</p>
        </div>
      </template>

      <div v-if="!sent" class="space-y-4">
        <UFormField label="Email">
          <UInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            class="w-full"
            @keydown.enter="signIn"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        <UButton block :loading="loading" @click="signIn">
          Send magic link
        </UButton>
        <UButton block color="neutral" variant="ghost" to="/">
          Continue without account
        </UButton>
      </div>

      <div v-else class="text-center space-y-3 py-2">
        <UIcon name="i-lucide-mail-check" class="w-10 h-10 text-primary mx-auto" />
        <p class="font-medium">Check your email</p>
        <p class="text-sm text-muted">We sent a magic link to {{ email }}</p>
        <UButton color="neutral" variant="ghost" block @click="sent = false">
          Use a different email
        </UButton>
      </div>
    </UCard>
  </div>
</template>
