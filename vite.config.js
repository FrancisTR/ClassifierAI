import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./public/manifest.json";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [crx({ manifest }), tailwindcss()],
});
