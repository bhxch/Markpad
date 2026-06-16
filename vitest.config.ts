import { defineConfig } from "vitest/config";

// Minimal vitest config for unit-testing pure frontend utils (e.g.
// processMarkdownHtml). Kept separate from vite.config.js so the Tauri/SvelteKit
// dev/build pipeline is untouched.
export default defineConfig({
	test: {
		environment: "happy-dom",
		include: ["src/**/*.test.ts"],
	},
});
