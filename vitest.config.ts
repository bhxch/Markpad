import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Minimal vitest config for unit-testing pure frontend utils (e.g.
// processMarkdownHtml). Kept separate from vite.config.js so the Tauri/SvelteKit
// dev/build pipeline is untouched.
// svelte() 让 vitest 能编译 .svelte.ts runes 模块（如 stores/settings.svelte.ts），
// 供 pipeline/highlight 等依赖响应式 store 的模块在单测中导入。
export default defineConfig({
	plugins: [svelte()],
	test: {
		environment: "happy-dom",
		include: ["src/**/*.test.ts"],
	},
});
