import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared")
    }
  },
  server: {
    proxy: {
      "/wcl/oauth/token": {
        target: "https://www.warcraftlogs.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wcl/, "")
      },
      "/wcl/api/v2/user": {
        target: "https://www.warcraftlogs.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wcl/, "")
      }
    }
  }
});
