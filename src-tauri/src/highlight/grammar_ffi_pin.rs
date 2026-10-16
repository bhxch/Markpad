//! D38 fork 钉子：FFI 生成层与语法注册的一致性（spec §8.2）。
//! 静态/DLL 两种模式都必须通过——钉住生成 FFI 的 c_symbol 覆盖与
//! 连字符转下划线规则不被合并破坏。

#[cfg(test)]
mod tests {
    use super::super::LanguageRegistry;

    /// 覆盖 c_symbol_override 与非常规 subpath 的代表样本 + 常规样本
    const PINNED: &[&str] = &[
        "rust", "c", "cpp", "python", "javascript", "yaml",
        "markdown", "markdown_inline",
        "ocaml", "ocaml-interface",
        "php", "php-only",
        "tsx", "typescript",
        "vue", "perl", "ebnf",
    ];

    #[test]
    fn pinned_languages_resolve_via_generated_ffi() {
        let registry = LanguageRegistry::new();
        for name in PINNED {
            assert!(
                registry.get_language(name).is_some(),
                "D38: 语法 {name} 未注册——grammar_ffi 生成层与 registry 失配"
            );
        }
    }

    #[test]
    fn unknown_language_is_none() {
        let registry = LanguageRegistry::new();
        assert!(registry.get_language("definitely-not-a-language").is_none());
    }

    #[test]
    fn registry_covers_all_grammars() {
        let registry = LanguageRegistry::new();
        assert!(
            registry.languages.len() >= 264,
            "D38: 注册语法数 {} 少于 264，语法清单疑似被合并截断",
            registry.languages.len()
        );
    }
}
