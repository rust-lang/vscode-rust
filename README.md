# Rust support for Visual Studio Code

[![](https://vsmarketplacebadge.apphb.com/version/rust-lang.rust.svg)](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust)
[![VSCode + Node.js CI](https://img.shields.io/github/workflow/status/rust-lang/rls-vscode/VSCode%20+%20Node.js%20CI.svg?logo=github)](https://github.com/rust-lang/rls-vscode/actions?query=workflow%3A%22VSCode+%2B+Node.js+CI%22)

Adds language support for Rust to Visual Studio Code. Supports:

* code completion
* jump to definition, peek definition, find all references, symbol search
* types and documentation on hover
* code formatting
* refactoring (rename, deglob)
* error squiggles and apply suggestions from errors
* snippets
* build tasks

Rust support is powered by a separate [language server](https://microsoft.github.io/language-server-protocol/overviews/lsp/overview/) -
either by the official [Rust Language Server](https://github.com/rust-lang/rls) (RLS) or
[rust-analyzer](https://github.com/rust-analyzer/rust-analyzer), depending on the user's
preference. If you don't have it installed, the extension will install it for
you (with permission).

This extension is built and maintained by the Rust
[IDEs and editors team](https://www.rust-lang.org/en-US/team.html#Dev-tools-team).
Our focus is on providing
a stable, high quality extension that makes the best use of the respective language
server. We aim to support as many features as possible, but our priority is
supporting the essential features as well as possible.

For support, please file an
[issue on the repo](https://github.com/rust-lang/rls-vscode/issues/new)
or talk to us [on Discord](https://discordapp.com/invite/rust-lang).
For RLS, there is also some [troubleshooting and debugging](https://github.com/rust-lang/rls/blob/master/debugging.md) advice.

## Contribution

Contributing code, tests, documentation, and bug reports is appreciated! For
more details see [contributing.md](contributing.md).


## Quick start

1. Install [rustup](https://www.rustup.rs/) (Rust toolchain manager).
2. Install this extension from [the VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust)
  (or by entering `ext install rust-lang.rust` at the command palette <kbd>Ctrl</kbd>+<kbd>P</kbd>).
3. (Skip this step if you already have Rust projects that you'd like to work on.)
  Create a new Rust project by following [these instructions](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html).
4. Open a Rust project (`File > Add Folder to Workspace...`). Open the folder for the whole
  project (i.e., the folder containing `Cargo.toml`, not the `src` folder).
5. You'll be prompted to install the Rust server. Once installed, it should start
  analyzing your project (RLS will also have to build the project).


## Configuration

This extension provides options in VSCode's configuration settings. These
include `rust.*`, which are passed directly to RLS, and the `rust-client.*`
, which mostly deal with how to spawn it or debug it.
You can find the settings under `File > Preferences > Settings`; they all
have IntelliSense help.

Examples:

* `rust.show_warnings` - set to false to silence warnings in the editor.
* `rust.all_targets` - build and index code for all targets (i.e., integration tests, examples, and benches)
* `rust.cfg_test` - build and index test code (i.e., code with `#[cfg(test)]`/`#[test]`)
* `rust-client.channel` - specifies from which toolchain the RLS should be spawned

> **_TIP:_** To select the underlying language server, set `rust-client.engine` accordingly!

## Features

### Snippets

Snippets are code templates which expand into common boilerplate. IntelliSense
includes snippet names as options when you type; select one by pressing
<kbd>enter</kbd>. You can move to the next snippet 'hole' in the template by
pressing <kbd>tab</kbd>. We provide the following snippets:

* `for` - a for loop
* `macro_rules` - declare a macro
* `if let` - an `if let` statement for executing code only when a pattern matches
* `spawn` - spawn a thread
* `extern crate` - insert an `extern crate` statement

This extension is deliberately conservative about snippets and doesn't include
too many. If you want more, check out
[Trusty Rusty Snippets](https://marketplace.visualstudio.com/items?itemName=polypus74.trusty-rusty-snippets).

### Tasks

The plugin provides tasks for building, running, and testing using the relevant
cargo commands. You can build using <kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>b</kbd>(Win/Linux), <kbd>cmd</kbd>+<kbd>shift</kbd>+<kbd>b</kbd>(macOS).
Access other tasks via `Run Task` in the command palette.

The plugin writes these into `tasks.json`. The plugin will not overwrite
existing tasks, so you can customise these tasks. To refresh back to the
defaults, delete `tasks.json` and restart VSCode.


## Format on save

To enable formatting on save, you need to set the `editor.formatOnSave` setting
to `true`. Find it under `File > Preferences > Settings`.


## Requirements

* [Rustup](https://www.rustup.rs/),
* A Rust toolchain (the extension will configure this for you, with permission),
* `rls`, `rust-src`, and `rust-analysis` components (the extension will install
  these for you, with permission). Only `rust-src` is required when using
  rust-analyzer.


## Implementation

Both language servers can use Cargo to get more information about Rust projects
and both use [`rustfmt`](https://github.com/rust-lang/rustfmt/) extensively to
format the code.

[RLS](https://github.com/rust-lang/rls) uses Cargo and also the Rust compiler
([`rustc`](https://github.com/rust-lang/rust/)) in a more direct fashion, where
it builds the project and reuses the data computed by the compiler itself. To
provide code completion it uses a separate tool called
[`racer`](https://github.com/racer-rust/racer).

[Rust Analyzer](https://github.com/rust-analyzer/rust-analyzer) is a separate
compiler frontend for the Rust language that doesn't use the Rust compiler
([`rustc`](https://github.com/rust-lang/rust/)) directly but rather performs its
own analysis that's tailor-fitted to the editor/IDE use case.
