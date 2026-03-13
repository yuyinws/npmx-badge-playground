<script setup lang="ts">
const BADGE_TYPE_GROUPS = [
  {
    title: 'Download Stats',
    items: ['downloads', 'downloads-day', 'downloads-week', 'downloads-month', 'downloads-year']
  },
  {
    title: 'Package Info',
    items: ['name', 'version', 'license', 'size', 'dependencies', 'created', 'updated', 'maintainers']
  },
  {
    title: 'Runtime & Types',
    items: ['engines', 'types']
  },
  {
    title: 'Security & Status',
    items: ['vulnerabilities', 'deprecated']
  },
  {
    title: 'Quality Scores',
    items: ['quality', 'popularity', 'maintenance', 'score']
  }
]

type BadgeType = (typeof BADGE_TYPE_GROUPS)[number]['items'][number]

const config = useLocalStorage('config', {
  packageName: 'nuxt',
  selectedTypes: ['version', 'license', 'size', 'downloads-month'],
  useLabelColor: false,
  labelColor: '#00C16A',
  useTextColor: false,
  textColor: '#00C16A',
  useShieldsioStyle: false
}, { mergeDefaults: true })

const normalizedPackageName = computed(() => config.value.packageName.trim())
const debouncedPackageName = ref('')
const hasValidPackageName = computed(() => normalizedPackageName.value.length > 0)
const packageCheckStatus = ref<'idle' | 'checking' | 'exists' | 'not-found' | 'error'>('idle')
const packageCheckMessage = ref('')
let packageCheckRequestId = 0
let hasInitializedDebounce = false

type PackageCheckError = {
  statusCode?: number
  response?: {
    status?: number
  }
  data?: {
    message?: string
  }
  message?: string
}

function normalizeHexColor(value: string) {
  return value.replace('#', '').trim()
}

function buildBadgeUrl(type: BadgeType) {
  if (!hasValidPackageName.value) {
    return ''
  }

  const base = `https://npmx.dev/api/registry/badge/${type}/${normalizedPackageName.value}`
  const params = new URLSearchParams()

  if (config.value.useLabelColor) {
    const labelColor = normalizeHexColor(config.value.labelColor)
    if (labelColor) {
      params.set('labelColor', labelColor)
    }
  }

  if (config.value.useTextColor) {
    const color = normalizeHexColor(config.value.textColor)
    if (color) {
      params.set('color', color)
    }
  }

  if (config.value.useShieldsioStyle) {
    params.set('style', 'shieldsio')
  }

  const query = params.toString()
  return query ? `${base}?${query}` : base
}

function buildPackageUrl() {
  if (!hasValidPackageName.value) {
    return ''
  }

  return `https://npmx.dev/package/${normalizedPackageName.value}`
}

function buildMarkdown(type: BadgeType) {
  const badgeUrl = buildBadgeUrl(type)
  const packageUrl = buildPackageUrl()

  if (!badgeUrl || !packageUrl) {
    return ''
  }

  return `[![Open on npmx.dev](${badgeUrl})](${packageUrl})`
}

const previewItems = computed(() =>
  packageCheckStatus.value === 'exists'
    ? config.value.selectedTypes.map(type => ({
        type,
        badgeUrl: buildBadgeUrl(type),
        packageUrl: buildPackageUrl(),
        markdown: buildMarkdown(type)
      }))
    : []
)
const loadedImageCount = ref(0)
const previewImagesContainer = ref<HTMLElement | null>(null)

watch(
  () => previewItems.value.map(item => item.badgeUrl).join('|'),
  async () => {
    loadedImageCount.value = 0

    await nextTick()
    const images = previewImagesContainer.value?.querySelectorAll('img') ?? []
    let completedCount = 0

    for (const image of images) {
      if (image.complete) {
        completedCount++
      }
    }

    loadedImageCount.value = completedCount
  },
  { immediate: true }
)

const isImagesLoading = computed(() =>
  previewItems.value.length > 0 && loadedImageCount.value < previewItems.value.length
)

const markdownCode = computed(() =>
  previewItems.value
    .map(item => item.markdown)
    .filter(Boolean)
    .join('\n')
)

const highlightedMarkdownCode = ref('')
const toast = useToast()

watchEffect(async () => {
  if (!markdownCode.value) {
    highlightedMarkdownCode.value = ''
    return
  }

  const { codeToHtml } = await import('shiki')
  highlightedMarkdownCode.value = await codeToHtml(markdownCode.value, {
    lang: 'markdown',
    themes: {
      light: 'vitesse-light',
      dark: 'vitesse-dark'
    }
  })
})

watch(
  normalizedPackageName,
  (packageName) => {
    if (!hasInitializedDebounce) {
      debouncedPackageName.value = packageName
      hasInitializedDebounce = true
      return
    }

    const timer = setTimeout(() => {
      debouncedPackageName.value = packageName
    }, 400)

    return () => {
      clearTimeout(timer)
    }
  },
  { immediate: true }
)

watch(
  debouncedPackageName,
  async (packageName) => {
    const requestId = ++packageCheckRequestId

    if (!packageName) {
      packageCheckStatus.value = 'idle'
      packageCheckMessage.value = ''
      return
    }

    packageCheckStatus.value = 'checking'
    packageCheckMessage.value = ''

    try {
      const result = await $fetch<{
        error?: boolean
        statusCode?: number
        message?: string
      }>(`https://npm.antfu.dev/${packageName}`)

      if (requestId !== packageCheckRequestId) {
        return
      }

      if (result?.error) {
        if (result.statusCode === 404) {
          packageCheckStatus.value = 'not-found'
          packageCheckMessage.value = result.message || `Package "${packageName}" does not exist.`
          return
        }

        packageCheckStatus.value = 'error'
        packageCheckMessage.value = result.message || 'Failed to validate package name.'
        return
      }

      packageCheckStatus.value = 'exists'
      packageCheckMessage.value = ''
    } catch (error: unknown) {
      if (requestId !== packageCheckRequestId) {
        return
      }

      const packageCheckError = error as PackageCheckError
      const statusCode = packageCheckError.statusCode || packageCheckError.response?.status
      const message = packageCheckError.data?.message || packageCheckError.message

      if (statusCode === 404) {
        packageCheckStatus.value = 'not-found'
        packageCheckMessage.value = message || `Package "${packageName}" does not exist.`
        return
      }

      packageCheckStatus.value = 'error'
      packageCheckMessage.value = message || 'Failed to validate package name.'
    }
  },
  { immediate: true }
)

async function copyMarkdownCode() {
  if (!markdownCode.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(markdownCode.value)
    toast.add({
      title: 'Copied',
      description: 'Markdown code copied to clipboard',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'Please check clipboard permissions',
      color: 'error'
    })
  }
}

async function copySingleMarkdown(markdown: string, type: BadgeType) {
  if (!markdown) {
    return
  }

  try {
    await navigator.clipboard.writeText(markdown)
    toast.add({
      title: 'Copied',
      description: `${type} markdown copied to clipboard`,
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'Please check clipboard permissions',
      color: 'error'
    })
  }
}

function onPreviewImageSettled() {
  loadedImageCount.value = Math.min(loadedImageCount.value + 1, previewItems.value.length)
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-settings"
            class="size-5"
          />
          <span class="text-lg font-bold">
            Config
          </span>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField label="Package Name">
          <UInput
            v-model="config.packageName"
            class="w-full"
            icon="i-lucide-package"
            placeholder="Enter package name"
          />
        </UFormField>

        <UFormField label="Badge Types">
          <div class="space-y-2">
            <div
              v-for="group in BADGE_TYPE_GROUPS"
              :key="group.title"
              class="border border-muted rounded-md py-2 px-4"
            >
              <div class="text-muted text-sm mb-1">
                {{ group.title }}
              </div>
              <UCheckboxGroup
                v-model="config.selectedTypes"
                :ui="{
                  fieldset: 'flex flex-wrap'
                }"
                orientation="horizontal"
                variant="list"
                :items="[...group.items]"
              />
            </div>
          </div>
        </UFormField>

        <UFormField label="Label Color">
          <div class="flex items-center gap-2">
            <USwitch
              v-model="config.useLabelColor"
              label="Enable"
            />
            <UPopover>
              <UButton
                :label="config.labelColor"
                color="neutral"
                variant="outline"
              >
                <template #leading>
                  <span
                    :style="{ backgroundColor: config.labelColor }"
                    class="size-3 rounded-full"
                  />
                </template>
              </UButton>

              <template #content>
                <UColorPicker
                  v-model="config.labelColor"
                  class="p-2"
                />
              </template>
            </UPopover>
          </div>
        </UFormField>

        <UFormField label="Text Color">
          <div class="flex items-center gap-2">
            <USwitch
              v-model="config.useTextColor"
              label="Enable"
            />
            <UPopover>
              <UButton
                :label="config.textColor"
                color="neutral"
                variant="outline"
              >
                <template #leading>
                  <span
                    :style="{ backgroundColor: config.textColor }"
                    class="size-3 rounded-full"
                  />
                </template>
              </UButton>

              <template #content>
                <UColorPicker
                  v-model="config.textColor"
                  class="p-2"
                />
              </template>
            </UPopover>
          </div>
        </UFormField>

        <UFormField label="Shieldsio Style">
          <USwitch
            v-model="config.useShieldsioStyle"
            label="Enable"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard
      :ui="{
        footer: 'bg-muted'
      }"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-eye"
            class="size-5"
          />
          <span class="text-lg font-bold">
            Preview
          </span>
        </div>
      </template>

      <div class="space-y-3">
        <UAlert
          v-if="!hasValidPackageName"
          color="warning"
          variant="soft"
          title="Please enter a package name"
          description="Badge preview will appear after entering an npm package name."
        />

        <UAlert
          v-else-if="packageCheckStatus === 'checking'"
          color="neutral"
          variant="soft"
          title="Checking package..."
          :description="`Validating ${normalizedPackageName} on npm registry.`"
        />

        <UAlert
          v-else-if="packageCheckStatus === 'not-found'"
          color="error"
          variant="soft"
          title="Package not found"
          :description="packageCheckMessage"
        />

        <UAlert
          v-else-if="packageCheckStatus === 'error'"
          color="warning"
          variant="soft"
          title="Validation failed"
          :description="packageCheckMessage"
        />

        <UAlert
          v-else-if="previewItems.length === 0"
          color="warning"
          variant="soft"
          title="No Badge Type Selected"
          description="Please select at least one type on the left."
        />

        <div
          v-else
          class="space-y-3"
        >
          <div class="relative min-h-8">
            <div
              v-if="isImagesLoading"
              class="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-default/60 pointer-events-none"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-5 animate-spin text-muted"
              />
            </div>

            <div
              ref="previewImagesContainer"
              class="flex flex-wrap gap-2"
            >
              <img
                v-for="item in previewItems"
                :key="item.type"
                class="inline cursor-pointer"
                :src="item.badgeUrl"
                :alt="`${item.type} badge`"
                :title="`Click to copy ${item.type} markdown`"
                @load="onPreviewImageSettled"
                @error="onPreviewImageSettled"
                @click="copySingleMarkdown(item.markdown, item.type)"
              >
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="space-y-2">
          <div class="flex items-center justify-end">
            <UButton
              icon="i-lucide-copy"
              size="sm"
              color="neutral"
              variant="soft"
              label="Copy"
              @click="copyMarkdownCode"
            />
          </div>
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="overflow-auto rounded-md h-150"
            v-html="highlightedMarkdownCode"
          />
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </template>
    </UCard>
  </div>
</template>

<style>
.shiki {
  text-wrap: auto;
}

.dark .shiki,
.dark .shiki span {
  color: var(--shiki-dark) !important;
}

.vitesse-light, .vitesse-dark {
  background-color: transparent!important;
}
</style>
