import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/icon/icon.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/progress/linear-progress.js";
import "@material/web/divider/divider.js";
import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/dialog/dialog.js";
import "@material/web/checkbox/checkbox.js";

createApp(App).use(router).mount("#app");
