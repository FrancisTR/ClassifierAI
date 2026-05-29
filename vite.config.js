import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        popup: "src/main.html",
        content: "src/imageClassifier.js",
      },
    },
  },
});
