// Empty path polyfill for browser
// @ts-nocheck
export default {};
export const join = (...args) => args.join('/');
export const resolve = (...args) => args.join('/');
export const dirname = () => '.';
export const basename = () => '';
export const extname = () => '';
export const parse = () => ({ root: '', dir: '', base: '', ext: '', name: '' });
