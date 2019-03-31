# Rust support for Visual Studio Code

[![](https://vsmarketplacebadge.apphb.com/version/rust-lang.rust.svg)](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust)
[![Build Status](https://travis-ci.org/rust-lang/rls-vscode.svg?branch=master)](https://travis-ci.org/rust-lang/rls-vscode)

Adds language support for Rust to Visual Studio Code. Supports:

* code completion
* jump to definition, peek definition, find all references, symbol search
* types and documentation on hover
* code formatting
* refactoring (rename, deglob)
* error squiggles and apply suggestions from errors
* snippets
* build tasks


Rust support is powered by the [Rust Language Server](https://github.com/rust-lang/rls)
(RLS). If you don't have it installed, the extension will install it for you.

This extension is built and maintained by the RLS team, part of the Rust
[IDEs and editors team](https://www.rust-lang.org/en-US/team.html#Dev-tools-team).
It is the reference client implementation for the RLS. Our focus is on providing
a stable, high quality extension that makes best use of the RLS. We aim to
support as many features as possible, but our priority is supporting the
essential features as well as possible.

For support, please file an [issue on the repo](https://github.com/rust-lang/rls-vscode/issues/new)
or talk to us [on Discord](https://discordapp.com/invite/rust-lang). There is also some
[troubleshooting and debugging](https://github.com/rust-lang/rls/blob/master/debugging.md)
advice.

Contributing code, tests, documentation, and bug reports is appreciated! For
more details on building and debugging, etc., see [contributing.md](contributing.md).


## Quick start

* Install [rustup](https://www.rustup.rs/) (Rust toolchain manager).
* Install this extension from [the VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust)
  (or by entering `ext install rust-lang.rust` at the command palette <kbd>Ctrl</kbd>+<kbd>P</kbd>).
* (Skip this step if you already have Rust projects that you'd like to work on.)
  Create a new Rust project by following [these instructions](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html).
* Open a Rust project (`File > Add Folder to Workspace...`). Open the folder for the whole
  project (i.e., the folder containing 'Cargo.toml'), not the 'src' folder.
* You'll be prompted to install the RLS. Once installed, the RLS should start
  building your project.


## Configuration

This extension provides options in VSCode's configuration settings. These
include `rust.*`, which are passed directly to RLS, and the `rust-client.*`
, which mostly deal with how to spawn it or debug it.
You can find the settings under `File > Preferences > Settings`; they all
have Intellisense help.

Some highlights:

* `rust.show_warnings` - set to false to silence warnings in the editor.
* `rust.all_targets` - build and index code for all targets (i.e., integration tests, examples, and benches)
* `rust.cfg_test` - build and index test code (i.e., code with `#[cfg(test)]`/`#[test]`)

* `rust-client.channel` - specifies from which toolchain the RLS should be spawned

## Features

### Commands

Commands can be found in the command palette <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. We provide the
following commands:

* `Find Implementations` - Find locations of `impl` blocks for traits, structs, and enums.
  Usefull to find all structs implementing a specific trait or all traits implemented for a struct.
  Select a type when running the command.


### Snippets

Snippets are code templates which expand into common boilerplate. Intellisense
includes snippet names as options when you type; select one by pressing 'enter'.
You can move to the next 'hole' in the template by pressing 'tab'. We provide
the following snippets:

* `for` - a for loop
* `unimplemented`
* `unreachable`
* `print(ln)`
* `assert(_eq)`
* `macro_rules` - declare a macro
* `if let Option` - an `if let` statement for executing code only in the `Some`
  case.
* `spawn` - spawn a thread
* `extern crate` - insert an `extern crate` statement

This extension is deliberately conservative about snippets and doesn't include
too many. If you want more, check out
[Trusty Rusty Snippets](https://marketplace.visualstudio.com/items?itemName=polypus74.trusty-rusty-snippets).

### Tasks

The plugin provides tasks for building, running, and testing using the relevant
cargo commands. You can build using <kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>b</kbd>. Access other tasks via
`Run Task` in the command palette.

The plugin writes these into `tasks.json`. The plugin will not overwrite
existing tasks, so you can customise these tasks. To refresh back to the
defaults, delete `tasks.json` and restart VSCode.


## Format on save

To enable formatting on save, you need to set the `editor.formatOnSave` setting
to `true`. Find it under `File > Preferences > Settings`.


## Requirements

* [Rustup](https://www.rustup.rs/),
* A Rust toolchain (the extension will configure this for you, with
  permission),
* `rls`, `rust-src`, and `rust-analysis` components (the
  extension will install these for you, with permission).


## Implementation

This extension almost exclusively uses the RLS for its feature support (syntax
highlighting, snippets, and build tasks are provided client-side). The RLS uses
the Rust compiler (`rustc`) to get data about Rust programs. It uses Cargo to
manage building. Both Cargo and `rustc` are run in-process by the RLS. Formatting
and code completion are provided by `rustfmt` and Racer, again both of these are
run in-process by the RLS.

