# Third-Party Licenses

This project uses open source software from the following projects.

## Helix Editor

**Source:** https://github.com/helix-editor/helix

**License:** Mozilla Public License Version 2.0 (MPL-2.0)

**Used for:**
- Tree-sitter queries (`src-tauri/queries/`) - syntax highlighting patterns
- Language configuration reference (`languages.toml`)

```
Mozilla Public License Version 2.0
==================================

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.
```

Full license text: https://www.mozilla.org/en-US/MPL/2.0/

---

## Tree-sitter Grammars

Tree-sitter grammars are compiled from source for syntax highlighting.
Most grammars use the MIT License.

**License:** MIT License (majority)

**Grammar Sources:**

| Language | Source | License |
|----------|--------|---------|
| rust | https://github.com/tree-sitter/tree-sitter-rust | MIT |
| python | https://github.com/tree-sitter/tree-sitter-python | MIT |
| javascript | https://github.com/tree-sitter/tree-sitter-javascript | MIT |
| typescript | https://github.com/tree-sitter/tree-sitter-typescript | MIT |
| c | https://github.com/tree-sitter/tree-sitter-c | MIT |
| cpp | https://github.com/tree-sitter/tree-sitter-cpp | MIT |
| c-sharp | https://github.com/tree-sitter/tree-sitter-c-sharp | MIT |
| go | https://github.com/tree-sitter/tree-sitter-go | MIT |
| java | https://github.com/tree-sitter/tree-sitter-java | MIT |
| html | https://github.com/tree-sitter/tree-sitter-html | MIT |
| css | https://github.com/tree-sitter/tree-sitter-css | MIT |
| json | https://github.com/tree-sitter/tree-sitter-json | MIT |
| yaml | https://github.com/ikatyang/tree-sitter-yaml | MIT |
| toml | https://github.com/ikatyang/tree-sitter-toml | MIT |
| markdown | https://github.com/MDeiml/tree-sitter-markdown | MIT |
| bash | https://github.com/tree-sitter/tree-sitter-bash | MIT |
| sql | https://github.com/DerekStride/tree-sitter-sql | MIT |
| ruby | https://github.com/tree-sitter/tree-sitter-ruby | MIT |
| php | https://github.com/tree-sitter/tree-sitter-php | MIT |
| swift | https://github.com/alex-pinkus/tree-sitter-swift | MIT |
| kotlin | https://github.com/fwcd/tree-sitter-kotlin | MIT |
| scala | https://github.com/tree-sitter/tree-sitter-scala | MIT |
| lua | https://github.com/MunifTanjim/tree-sitter-lua | MIT |
| perl | https://github.com/tree-sitter/tree-sitter-perl | MIT |
| haskell | https://github.com/tree-sitter/tree-sitter-haskell | MIT |
| ocaml | https://github.com/tree-sitter/tree-sitter-ocaml | MIT |
| elixir | https://github.com/elixir-lang/tree-sitter-elixir | Apache-2.0 |
| erlang | https://github.com/WhatsApp/tree-sitter-erlang | Apache-2.0 |
| clojure | https://github.com/sogaiu/tree-sitter-clojure | MIT |
| scheme | https://github.com/6cdh/tree-sitter-scheme | MIT |
| r | https://github.com/r-lib/tree-sitter-r | MIT |
| julia | https://github.com/tree-sitter/tree-sitter-julia | MIT |
| dart | https://github.com/UserNobody14/tree-sitter-dart | MIT |
| zig | https://github.com/maxxnino/tree-sitter-zig | MIT |
| vue | https://github.com/ikatyang/tree-sitter-vue | MIT |
| svelte | https://github.com/Himujjal/tree-sitter-svelte | MIT |
| dockerfile | https://github.com/camdencheek/tree-sitter-dockerfile | MIT |
| cmake | https://github.com/uyha/tree-sitter-cmake | MIT |
| make | https://github.com/alemuller/tree-sitter-make | MIT |
| xml | https://github.com/RenjiSann/tree-sitter-xml | MIT |
| diff | https://github.com/the-mikedavis/tree-sitter-diff | MIT |
| gitignore | https://github.com/shunsambongi/tree-sitter-gitignore | MIT |
| gitcommit | https://github.com/gbprod/tree-sitter-gitcommit | MIT |
| gitattributes | https://github.com/the-mikedavis/tree-sitter-gitattributes | MIT |
| regex | https://github.com/tree-sitter/tree-sitter-regex | MIT |
| comment | https://github.com/stsewd/tree-sitter-comment | MIT |
| ledger | https://github.com/cbarrete/tree-sitter-ledger | MIT |
| org | https://github.com/milisims/tree-sitter-org | MIT |
| latex | https://github.com/latex-lsp/tree-sitter-latex | MIT |
| bibtex | https://github.com/latex-lsp/tree-sitter-bibtex | MIT |
| beancount | https://github.com/polarmutex/tree-sitter-beancount | MIT |
| fsharp | https://github.com/ionide/tree-sitter-fsharp | MIT |
| nim | https://github.com/alaviss/tree-sitter-nim | MIT |
| crystal | https://github.com/crystal-lang-tools/tree-sitter-crystal | MIT |
| fortran | https://github.com/stadelmanma/tree-sitter-fortran | MIT |
| pascal | https://github.com/Isopod/tree-sitter-pascal | MIT |
| ada | https://github.com/briot/tree-sitter-ada | MIT |
| astro | https://github.com/virchau13/tree-sitter-astro | MIT |
| fish | https://github.com/ram02z/tree-sitter-fish | MIT |
| powershell | https://github.com/airbus-cert/tree-sitter-powershell | MIT |
| csv | https://github.com/arnau/tree-sitter-csv | MIT |
| ini | https://github.com/justinmk/tree-sitter-ini | MIT |
| sshclientconfig | https://github.com/metio/tree-sitter-sshclientconfig | MIT |
| git-rebase | https://github.com/the-mikedavis/tree-sitter-git-rebase | MIT |
| glsl | https://github.com/theHamsta/tree-sitter-glsl | MIT |
| wgsl | https://github.com/szebniok/tree-sitter-wgsl | MIT |
| llvm | https://github.com/benwilliamgraham/tree-sitter-llvm | MIT |
| llvm-mir | https://github.com/Flakebi/tree-sitter-llvm-mir | MIT |
| tablegen | https://github.com/Flakebi/tree-sitter-tablegen | MIT |
| ninja | https://github.com/alemuller/tree-sitter-ninja | MIT |
| meson | https://github.com/Decodetalkers/tree-sitter-meson | MIT |
| nix | https://github.com/cstrahan/tree-sitter-nix | MIT |
| nickel | https://github.com/nickel-lang/tree-sitter-nickel | MIT |
| blueprint | https://github.com/hh9527/tree-sitter-blueprint | MIT |
| wat | https://github.com/wasm-lsp/tree-sitter-wasm | MIT |
| wast | https://github.com/wasm-lsp/tree-sitter-wasm | MIT |
| v | https://github.com/vlang/v-analyzer | MIT |
| verilog | https://github.com/andreytkachenko/tree-sitter-verilog | MIT |
| systemverilog | https://github.com/gmlarumbe/tree-sitter-systemverilog | MIT |
| tlaplus | https://github.com/tlaplus-community/tree-sitter-tlaplus | MIT |
| lean | https://github.com/Julian/tree-sitter-lean | Apache-2.0 |
| move | https://github.com/tzakian/tree-sitter-move | Apache-2.0 |
| odin | https://github.com/Cloudef/tree-sitter-odin | MIT |
| Cairo | https://github.com/archseer/tree-sitter-cairo | MIT |
| CUE | https://github.com/eonpatapon/tree-sitter-cue | MIT |
| SLang | https://github.com/theHamsta/tree-sitter-slang | MIT |
| d | https://github.com/gdamore/tree-sitter-d | MIT |
| elvish | https://github.com/ckafi/tree-sitter-elvish | MIT |
| fan | https://github.com/Orvid/tree-sitter-fan | MIT |
| hcl | https://github.com/MichaHoffmann/tree-sitter-hcl | MIT |
| hocon | https://github.com/antosha417/tree-sitter-hocon | MIT |
| hoon | https://github.com/urbit-pilled/tree-sitter-hoon | MIT |
| iex | https://github.com/elixir-lang/tree-sitter-iex | Apache-2.0 |
| javascript-esbuild | https://github.com/romgrk/tree-sitter-esbuild | MIT |
| jsonnet | https://github.com/sourcegraph/tree-sitter-jsonnet | MIT |
| just | https://github.com/IndianBoy42/tree-sitter-just | MIT |
| koto | https://github.com/koto-lang/tree-sitter-koto | MIT |
| mint | https://github.com/mint-lang/tree-sitter-mint | BSD-3-Clause |
| nu | https://github.com/LhKipp/tree-sitter-nu | MIT |
| odin | https://github.com/tree-sitter-perception/tree-sitter-odin | MIT |
| pony | https://github.com/mfelsche/tree-sitter-pony | MIT |
| prql | https://github.com/PRQL/tree-sitter-prql | Apache-2.0 |
| purescript | https://github.com/postsolar/tree-sitter-purescript | MIT |
| rescript | https://github.com/nkrkv/tree-sitter-rescript | MIT |
| rst | https://github.com/stsewd/tree-sitter-rst | MIT |
| slab | https://github.com/JJTech0130/tree-sitter-slab | MIT |
| smithy | https://github.com/indoorvivants/tree-sitter-smithy | MIT |
| solidql | https://github.com/Qriouse/tree-sitter-solidql | MIT |
| supercollider | https://github.com/madskjeldgaard/tree-sitter-supercollider | MIT |
| task | https://github.com/alexander-akait/tree-sitter-task | MIT |
| tcl | https://github.com/lewis6991/tree-sitter-tcl | MIT |
| teal | https://github.com/euclidianAce/tree-sitter-teal | MIT |
| thrift | https://github.com/duskmoon314/tree-sitter-thrift | MIT |
| tiger | https://github.com/ambroisie/tree-sitter-tiger | MIT |
| uxntal | https://github.com/Jummit/tree-sitter-uxntal | MIT |
| vhs | https://github.com/charmbracelet/tree-sitter-vhs | MIT |
| wast | https://github.com/wasm-lsp/tree-sitter-wasm | MIT |
| wit | https://github.com/liamwh/tree-sitter-wit | Apache-2.0 |
| xit | https://github.com/synaptiko/tree-sitter-xit | MIT |
| yang | https://github.com/Hubro/tree-sitter-yang | MIT |
| yuck | https://github.com/Philipp-M/tree-sitter-yuck | MIT |
| zathurarc | https://github.com/nobodywasishere/tree-sitter-zathurarc | MIT |

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Apache License 2.0

Some grammars use the Apache License 2.0:

- tree-sitter-elixir
- tree-sitter-erlang
- tree-sitter-lean
- tree-sitter-move
- tree-sitter-prql
- tree-sitter-wit

```
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## Note

For a complete list of grammar sources and their licenses, see the
`src-tauri/grammars/` directory. Each grammar subdirectory may contain
its own LICENSE file.
