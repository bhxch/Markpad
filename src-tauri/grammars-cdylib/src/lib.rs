//! D38 本地 crate：全部 tree-sitter 语法的动态链接形态（spec §5.1）。
//! 以 C ABI 导出各语法入口符号，主程序经导入库静态绑定；
//! TSLanguage 为跨 DLL 稳定的 C 数据结构（Neovim 动态语法同款模式）。
include!(concat!(env!("OUT_DIR"), "/grammar_exports.rs"));
