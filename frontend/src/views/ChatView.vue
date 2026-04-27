<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import SourcesList from "../components/SourcesList.vue";
import { streamChat } from "../api/chat";
import type { ChatTurn } from "../types";

interface OutlinedTextFieldEl extends HTMLElement {
  value: string;
}

const turns = ref<ChatTurn[]>([]);
const draft = ref("");
const isStreaming = ref(false);
const errorMessage = ref<string | null>(null);

const scrollEl = ref<HTMLElement | null>(null);
const textFieldEl = ref<OutlinedTextFieldEl | null>(null);

let abortController: AbortController | null = null;
let nextId = 1;

const canSend = computed(() => !isStreaming.value && draft.value.trim().length > 0);

function newId(): string {
  const id = `m-${nextId++}`;
  return id;
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = scrollEl.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function onInput(ev: Event): void {
  const target = ev.target as OutlinedTextFieldEl | null;
  draft.value = target?.value ?? "";
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    void send();
  }
}

async function send(): Promise<void> {
  if (!canSend.value) {
    return;
  }

  const question = draft.value.trim();
  if (question.length === 0) {
    return;
  }

  errorMessage.value = null;
  draft.value = "";
  if (textFieldEl.value) {
    textFieldEl.value.value = "";
  }

  const userTurn: ChatTurn = { id: newId(), role: "user", text: question };
  const assistantTurn: ChatTurn = {
    id: newId(),
    role: "assistant",
    text: "",
    sources: [],
    pending: true
  };

  turns.value.push(userTurn, assistantTurn);
  await scrollToBottom();

  isStreaming.value = true;
  abortController = new AbortController();

  try {
    await streamChat({
      question,
      signal: abortController.signal,
      onSources: (items) => {
        assistantTurn.sources = items;
      },
      onDelta: (text) => {
        assistantTurn.text += text;
        void scrollToBottom();
      },
      onError: (message) => {
        assistantTurn.errored = true;
        assistantTurn.text =
          assistantTurn.text.length > 0 ? `${assistantTurn.text}\n\n[错误] ${message}` : `[错误] ${message}`;
        errorMessage.value = message;
      },
      onDone: () => {
        assistantTurn.pending = false;
      }
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "未知错误";
    assistantTurn.errored = true;
    assistantTurn.pending = false;
    if (assistantTurn.text.length === 0) {
      assistantTurn.text = `[错误] ${message}`;
    }
    errorMessage.value = message;
  } finally {
    isStreaming.value = false;
    abortController = null;
    assistantTurn.pending = false;
    await scrollToBottom();
  }
}

function abort(): void {
  if (abortController) {
    abortController.abort();
  }
}

function clear(): void {
  abort();
  turns.value = [];
  errorMessage.value = null;
}

onBeforeUnmount(() => {
  abort();
});
</script>

<template>
  <section class="flex h-full flex-col">
    <div ref="scrollEl" class="scroll-thin flex-1 overflow-y-auto px-6 py-4">
      <div class="mx-auto flex max-w-3xl flex-col gap-4">
        <div
          v-if="turns.length === 0"
          class="mt-12 flex flex-col items-center gap-2 text-center text-on-surface-variant"
        >
          <span class="material-symbols-outlined text-4xl text-primary">forum</span>
          <p class="text-base">向你的本地知识库提问，例如「rule.md 的核心原则是什么？」</p>
          <p class="text-xs">回答会附带来源；点击来源可查看原文段落标题与路径。</p>
        </div>

        <article
          v-for="turn in turns"
          :key="turn.id"
          class="flex flex-col gap-2"
          :class="turn.role === 'user' ? 'items-end' : 'items-start'"
        >
          <div
            class="max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm ring-1"
            :class="
              turn.role === 'user'
                ? 'bg-primary-container text-on-primary-container ring-primary/20'
                : turn.errored
                  ? 'bg-error-container text-on-error-container ring-error/30'
                  : 'bg-surface-variant text-on-surface ring-outline/20'
            "
          >
            <span v-if="turn.text.length > 0">{{ turn.text }}</span>
            <span v-else-if="turn.role === 'assistant' && turn.pending" class="flex items-center gap-2">
              <md-circular-progress indeterminate four-color style="--md-circular-progress-size: 18px"></md-circular-progress>
              <span class="text-on-surface-variant">检索中…</span>
            </span>
            <span v-if="turn.role === 'assistant' && turn.pending && turn.text.length > 0" class="ml-1 inline-block animate-pulse">▍</span>
          </div>
          <SourcesList
            v-if="turn.role === 'assistant' && turn.sources && turn.sources.length > 0"
            :sources="turn.sources"
            :collapsed-default="!!turn.text"
            class="w-full max-w-[88%]"
          />
        </article>
      </div>
    </div>

    <div class="border-t border-outline/30 bg-surface px-6 py-3">
      <div class="mx-auto flex max-w-3xl flex-col gap-2">
        <div v-if="errorMessage" class="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
          {{ errorMessage }}
        </div>
        <div class="flex items-end gap-2">
          <md-outlined-text-field
            ref="textFieldEl"
            type="textarea"
            rows="2"
            label="向知识库提问"
            class="flex-1"
            style="min-height: 56px"
            :value="draft"
            @input="onInput"
            @keydown="onKeydown"
          ></md-outlined-text-field>
          <md-text-button v-if="turns.length > 0" :disabled="isStreaming" @click="clear">
            清空
          </md-text-button>
          <md-outlined-button v-if="isStreaming" @click="abort">
            <span class="material-symbols-outlined" slot="icon">stop_circle</span>
            中止
          </md-outlined-button>
          <md-filled-button :disabled="!canSend" @click="send">
            <span class="material-symbols-outlined" slot="icon">send</span>
            发送
          </md-filled-button>
        </div>
        <div class="text-[11px] text-on-surface-variant">回车发送 · Shift+回车换行 · 中止后已生成的内容保留</div>
      </div>
    </div>
  </section>
</template>
