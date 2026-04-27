import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/chat" },
  {
    path: "/chat",
    name: "chat",
    component: () => import("../views/ChatView.vue"),
    meta: { title: "对话" }
  },
  {
    path: "/status",
    name: "status",
    component: () => import("../views/StatusView.vue"),
    meta: { title: "索引状态" }
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
