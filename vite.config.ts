import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Production builds are served from https://itsrajverma.github.io/scribbly/
  base: command === "build" ? "/scribbly/" : "/",
  plugins: [react()],
}));
