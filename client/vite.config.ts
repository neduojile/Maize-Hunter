import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/antseed": {
        target: "http://127.0.0.1:8377",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/antseed/, ""),
      },
    },
  },
});
