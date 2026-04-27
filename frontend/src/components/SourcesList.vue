<script setup lang="ts">
import { computed } from "vue";
import type { ChatSource } from "../types";

const props = defineProps<{
  sources: ChatSource[];
  collapsedDefault?: boolean;
}>();

const items = computed(() =>
  props.sources.map((s, idx) => ({
    key: s.chunk_id ?? `${idx}:${s.source_path}:${s.section_title}`,
    index: idx + 1,
    title: s.doc_title || s.source_name || s.source_path,
    section: s.section_title,
    path: s.source_path,
    score: typeof s.score === "number" ? s.score.toFixed(3) : ""
  }))
);
</script>

<template>
  <details
    v-if="sources.length > 0"
    class="group rounded-2xl border border-outline/30 bg-surface-variant/40 p-3"
    :open="!collapsedDefault"
  >
    <summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-on-surface-variant">
      <span class="material-symbols-outlined text-[18px]">source</span>
      <span>来源（{{ sources.length }}）</span>
      <span class="ml-auto text-xs text-on-surface-variant/80 group-open:hidden">点击展开</span>
      <span class="ml-auto hidden text-xs text-on-surface-variant/80 group-open:inline">点击折叠</span>
    </summary>
    <ol class="mt-2 space-y-2 text-sm">
      <li
        v-for="it in items"
        :key="it.key"
        class="rounded-xl bg-surface px-3 py-2 ring-1 ring-outline/20"
      >
        <div class="flex items-baseline gap-2">
          <span class="text-xs text-on-surface-variant">[{{ it.index }}]</span>
          <span class="font-medium">{{ it.title }}</span>
          <span v-if="it.score" class="ml-auto text-xs text-on-surface-variant">score {{ it.score }}</span>
        </div>
        <div class="mt-0.5 text-xs text-on-surface-variant">{{ it.section }}</div>
        <div class="mt-0.5 truncate font-mono text-[11px] text-on-surface-variant/80" :title="it.path">
          {{ it.path }}
        </div>
      </li>
    </ol>
  </details>
</template>
