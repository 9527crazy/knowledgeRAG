<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: "chat", label: "对话", icon: "chat" },
  { name: "status", label: "索引状态", icon: "monitoring" }
];

const activeName = computed<string>(() => {
  const cur = route.name;
  return typeof cur === "string" ? cur : "chat";
});

function go(name: string): void {
  if (name !== activeName.value) {
    void router.push({ name });
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface text-on-surface">
    <header
      class="sticky top-0 z-10 flex items-center gap-4 border-b border-outline/30 bg-surface/95 px-6 py-3 backdrop-blur"
    >
      <div class="flex items-center gap-2 text-lg font-medium text-primary">
        <span class="material-symbols-outlined">graph_3</span>
        <span>knowledgeRAG 控制台</span>
      </div>
      <nav class="ml-4 flex gap-1">
        <button
          v-for="t in tabs"
          :key="t.name"
          type="button"
          :aria-current="activeName === t.name ? 'page' : undefined"
          class="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors"
          :class="
            activeName === t.name
              ? 'bg-primary-container text-on-primary-container'
              : 'text-on-surface-variant hover:bg-surface-variant/60'
          "
          @click="go(t.name)"
        >
          <span class="material-symbols-outlined text-[18px]">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </nav>
      <div class="ml-auto text-xs text-on-surface-variant">本地知识检索 · MVP</div>
    </header>

    <main class="flex flex-1 flex-col overflow-hidden">
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="flex-1" />
      </RouterView>
    </main>
  </div>
</template>
