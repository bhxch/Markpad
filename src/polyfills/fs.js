// Empty fs polyfill for browser
// @ts-nocheck
export default {};
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const existsSync = () => false;
export const mkdirSync = () => {};
export const readdirSync = () => [];
export const statSync = () => ({ isDirectory: () => false, isFile: () => false });
