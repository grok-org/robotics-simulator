import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
// import biomePlugin from "vite-plugin-biome";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDev = mode === "development";

  return {
    base: "/",
    assetsInclude: ['**/*.py'],
    define: {
      global: "globalThis",
      "process.env": JSON.stringify(env),
      "process.browser": true,
    },

    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile({
        useRecommendedBuildConfig: false,
        removeViteModuleLoader: true,
        deleteInlinedFiles: true,
        inlinePattern: ["!(**/pyodide.worker-*.js)"],
      }),
      // biomePlugin({
      //   mode: "check",
      //   failOnError: true,
      //   logKind: "pretty",
      // }),
    ],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        path: "path-browserify",
      },
    },

    build: {
      assetsDir: "assets",
      target: "esnext",
      sourcemap: isDev,
      minify: isDev ? false : "oxc",
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      chunkSizeWarningLimit: 10_000,
      rolldownOptions: {
        external: [/^node:/],
        output: {
          codeSplitting: false,
          comments: isDev,
        },
      },
    },

    optimizeDeps: {
    },

    worker: {
      format: "es",
      rolldownOptions: {
        external: [/^node:/],
        output: { codeSplitting: false }
      },
      plugins: () => [react()],
    },

    environments: {
      client: {
        build: {
          minify: isDev ? false : "oxc",
          cssCodeSplit: false,
        }
      }
    },
    server: {
      forwardConsole: true,
      host: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Document-Policy": "js-profiling",
      },
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
        ],
      },
    },
  };
});
