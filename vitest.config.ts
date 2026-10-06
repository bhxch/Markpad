import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { monacoImePatch } from './scripts/monacoImePatch.mjs';
import { mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// vitest 4 的 projects 不继承根级 plugins，svelte 编译插件必须放在项目级：
// - upstream-spec：沿用上游 sveltekit() 套件（编译 scripts/*.svelte.ts runes）+ browser 条件；
// - local-unit：沿用本地 svelte()（让 vitest 能编译 src/**/*.svelte.ts runes 模块，
//   供 pipeline/highlight 等依赖响应式 store 的本地单测导入）。
export default mergeConfig(await viteConfig({ mode: 'test', command: 'serve' }), {
  test: {
    projects: [
      {
        plugins: [monacoImePatch, sveltekit()],
        // resolve.conditions 必须与 test 同级（vitest 项目对象的顶层），
        // 嵌进 test{} 会被忽略，browser 条件不生效。
        resolve: { conditions: ['browser'] },
        test: {
          name: 'upstream-spec',
          include: ['scripts/**/*.spec.ts'],
          environment: 'jsdom',
        },
      },
      {
        plugins: [svelte()],
        test: {
          name: 'local-unit',
          include: ['src/**/*.test.ts'],
          environment: 'happy-dom',
          // pipeline 三件套（diagrams/highlight/index）全量并行时偶发 5s 默认
          // 超时（资源竞争，单跑恒绿），放宽到 15s 消除 flaky。
          testTimeout: 15000,
        },
      },
    ],
  },
});
