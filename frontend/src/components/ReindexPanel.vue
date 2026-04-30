<script setup lang="ts">
import { ref } from "vue";
import { postReindex } from "../api/reindex";
import { ApiError } from "../api/base";
import type { ReindexResponse } from "../types";

interface OutlinedTextFieldEl extends HTMLElement {
  value: string;
}

const emit = defineEmits<{
  (e: "done"): void;
}>();

const docId = ref("");
const docIdEl = ref<OutlinedTextFieldEl | null>(null);
const isLoading = ref(false);
const lastResult = ref<ReindexResponse | null>(null);
const lastError = ref<string | null>(null);

function onDocIdInput(ev: Event): void {
  const target = ev.target as OutlinedTextFieldEl | null;
  docId.value = target?.value ?? "";
}

async function trigger(payload: { doc_id?: string; mode?: "full_reset" }): Promise<void> {
  if (isLoading.value) {
    return;
  }
  isLoading.value = true;
  lastError.value = null;
  try {
    const result = await postReindex(payload);
    lastResult.value = result;
    emit("done");
  } catch (cause) {
    if (cause instanceof ApiError) {
      lastError.value = `${cause.code}: ${cause.message}`;
    } else if (cause instanceof Error) {
      lastError.value = cause.message;
    } else {
      lastError.value = "重建索引失败";
    }
  } finally {
    isLoading.value = false;
  }
}

function reindexFailed(): void {
  void trigger({});
}

function reindexById(): void {
  const id = docId.value.trim();
  if (id.length === 0) {
    lastError.value = "请输入 doc_id";
    return;
  }
  void trigger({ doc_id: id });
}

function fullReset(): void {
  void trigger({ mode: "full_reset" });
}
</script>

<template>
  <section class="rounded-2xl border border-outline/30 bg-surface-variant/40 p-4">
    <header class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">refresh</span>
      <h2 class="text-base font-medium">重建索引</h2>
    </header>
    <p class="mb-3 text-sm text-on-surface-variant">
      不带参数时仅重建状态为
      <code class="rounded bg-surface px-1 py-0.5 text-xs">failed</code>
      的文档；输入 <code class="rounded bg-surface px-1 py-0.5 text-xs">doc_id</code> 可定向重建单个文档；全量重建会清空向量库和台账后重新扫描所有文档。
    </p>

    <div class="flex flex-col gap-3 md:flex-row md:items-end">
      <md-outlined-text-field
        ref="docIdEl"
        label="doc_id（可选）"
        class="flex-1"
        :value="docId"
        @input="onDocIdInput"
      ></md-outlined-text-field>
      <div class="flex gap-2">
        <md-filled-button :disabled="isLoading" @click="reindexFailed">
          <span class="material-symbols-outlined" slot="icon">replay</span>
          重建失败项
        </md-filled-button>
        <md-outlined-button :disabled="isLoading || docId.trim().length === 0" @click="reindexById">
          <span class="material-symbols-outlined" slot="icon">priority_high</span>
          重建该 doc_id
        </md-outlined-button>
        <md-filled-tonal-button :disabled="isLoading" @click="fullReset">
          <span class="material-symbols-outlined" slot="icon">database</span>
          清空并全量重建
        </md-filled-tonal-button>
      </div>
    </div>

    <div v-if="isLoading" class="mt-3">
      <md-linear-progress indeterminate></md-linear-progress>
      <p class="mt-1 text-xs text-on-surface-variant">正在调度重建任务，请稍候…</p>
    </div>

    <div
      v-if="lastResult && !isLoading"
      class="mt-3 rounded-xl bg-surface px-3 py-2 text-sm text-on-surface ring-1 ring-outline/20"
    >
      <template v-if="lastResult.mode === 'full_reset'">
        全量重建完成：扫描 <strong>{{ lastResult.scanned ?? 0 }}</strong> 个文档；触发
        <strong>{{ lastResult.triggered }}</strong> 个；失败 <strong>{{ lastResult.failed }}</strong> 个。
      </template>
      <template v-else>
        已触发 <strong>{{ lastResult.triggered }}</strong> 个文档；失败 <strong>{{ lastResult.failed }}</strong> 个。
      </template>
    </div>

    <div
      v-if="lastError"
      class="mt-3 rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container"
    >
      {{ lastError }}
    </div>
  </section>
</template>
