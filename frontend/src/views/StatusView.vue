<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { fetchStatus } from "../api/status";
import { ApiError } from "../api/base";
import type { StatusResponse } from "../types";
import ReindexPanel from "../components/ReindexPanel.vue";

const status = ref<StatusResponse | null>(null);
const isLoading = ref(false);
const lastError = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);

let inflight: AbortController | null = null;

async function refresh(): Promise<void> {
  if (inflight) {
    inflight.abort();
  }
  const ac = new AbortController();
  inflight = ac;
  isLoading.value = true;
  lastError.value = null;
  try {
    const data = await fetchStatus(ac.signal);
    status.value = data;
    lastUpdated.value = new Date();
  } catch (cause) {
    if ((cause as { name?: string } | undefined)?.name === "AbortError") {
      return;
    }
    if (cause instanceof ApiError) {
      lastError.value = `${cause.code}: ${cause.message}`;
    } else if (cause instanceof Error) {
      lastError.value = cause.message;
    } else {
      lastError.value = "加载状态失败";
    }
  } finally {
    if (inflight === ac) {
      inflight = null;
    }
    isLoading.value = false;
  }
}

const lastIndexedHuman = computed<string>(() => {
  const t = status.value?.last_indexed_at ?? null;
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString();
});

const lastUpdatedHuman = computed<string>(() => {
  if (!lastUpdated.value) return "尚未刷新";
  return `更新于 ${lastUpdated.value.toLocaleTimeString()}`;
});

const cards = computed(() => {
  const s = status.value;
  return [
    { label: "已完成文档", value: s?.total_docs ?? 0, icon: "task_alt", tone: "primary" },
    { label: "向量片段数", value: s?.total_chunks ?? 0, icon: "memory", tone: "primary" },
    { label: "失败文档", value: s?.failed_docs ?? 0, icon: "error", tone: s && s.failed_docs > 0 ? "error" : "muted" },
    { label: "进行中", value: s?.indexing_docs ?? 0, icon: "sync", tone: s && s.indexing_docs > 0 ? "primary" : "muted" }
  ];
});

onMounted(() => {
  void refresh();
});

onBeforeUnmount(() => {
  if (inflight) {
    inflight.abort();
  }
});
</script>

<template>
  <section class="scroll-thin h-full overflow-y-auto px-6 py-4">
    <div class="mx-auto flex max-w-4xl flex-col gap-4">
      <header class="flex items-center gap-2">
        <h1 class="text-lg font-medium">索引状态</h1>
        <span class="text-xs text-on-surface-variant">{{ lastUpdatedHuman }}</span>
        <md-icon-button
          class="ml-auto"
          :disabled="isLoading"
          aria-label="刷新"
          @click="refresh"
        >
          <span class="material-symbols-outlined">refresh</span>
        </md-icon-button>
      </header>

      <md-linear-progress v-if="isLoading" indeterminate></md-linear-progress>

      <div
        v-if="lastError"
        class="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container"
      >
        {{ lastError }}
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          v-for="c in cards"
          :key="c.label"
          class="rounded-2xl border border-outline/30 bg-surface-variant/40 p-4"
        >
          <div class="flex items-center gap-2 text-sm text-on-surface-variant">
            <span
              class="material-symbols-outlined text-[20px]"
              :class="c.tone === 'error' ? 'text-error' : c.tone === 'primary' ? 'text-primary' : 'text-on-surface-variant'"
            >{{ c.icon }}</span>
            <span>{{ c.label }}</span>
          </div>
          <div class="mt-2 text-2xl font-medium tabular-nums">{{ c.value }}</div>
        </div>
      </div>

      <div class="rounded-2xl border border-outline/30 bg-surface-variant/40 p-4">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">schedule</span>
          <span class="text-sm">最近一次完成索引</span>
          <span class="ml-auto font-mono text-sm">{{ lastIndexedHuman }}</span>
        </div>
      </div>

      <section class="rounded-2xl border border-outline/30 bg-surface-variant/40 p-4">
        <header class="mb-2 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">folder_open</span>
          <h2 class="text-base font-medium">数据源</h2>
          <span class="ml-auto text-xs text-on-surface-variant">{{ status?.sources?.length ?? 0 }} 个</span>
        </header>
        <ul v-if="status && status.sources.length > 0" class="space-y-2 text-sm">
          <li
            v-for="src in status.sources"
            :key="src.name + src.path"
            class="rounded-xl bg-surface px-3 py-2 ring-1 ring-outline/20"
          >
            <div class="flex items-baseline gap-2">
              <span class="font-medium">{{ src.name }}</span>
              <span class="ml-auto text-xs text-on-surface-variant">{{ src.doc_count }} 个文档</span>
            </div>
            <div class="mt-0.5 truncate font-mono text-[11px] text-on-surface-variant" :title="src.path">
              {{ src.path }}
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-on-surface-variant">暂无数据源信息。</p>
      </section>

      <ReindexPanel @done="refresh" />
    </div>
  </section>
</template>
