import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" faz o build funcionar em qualquer subpasta (ex.: usuario.github.io/repo/)
// sem precisar editar nada ao trocar de repositório.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
  },
});
