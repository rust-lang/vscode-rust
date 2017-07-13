# VSCode reference client for the RLS

This repo provides the RLS client for vscode built using the Language 
Server protocol. This plugin will start the RLS for you, assuming it is in 
your path.

For details on building and running, etc., see [contributing.md](contributing.md).

## Features

### Commands

Commands can be found in the command palette (ctrl + shift + p). We provide the
following commands:

* `deglob` - replace a glob import with an explicit import. E.g., replace
  `use foo::*;` with `use foo::{bar, baz};`. Select only the `*` when running
  the command.


### Snippets

Snippets are code templates which expand into common boilerplate. Intellisense
includes snippet names as options when you type; select one by pressing 'enter'.
You can move to the next 'hole' in the template by pressing 'tab'. We provide
the following snippets:

* `for` - a for loop
* `unimplemented`
* `unreachable`
* `println`
* `macro_rules` - declare a macro
* `if let Option` - an `if let` statement for executing code only in the `Some` case.
* `spawn` - spawn a thread


### Tasks

The plugin provides tasks for building, running, and testing using the relevant
cargo commands. You can build using `ctrl + shift + b`. Access other tasks via
`Run tasks` in the command palette.

The plugin writes these into `tasks.json`. The plugin will not overwrite
existing tasks, so you can customise these tasks. To refresh back to the
defaults, delete `tasks.json` and restart VSCode.


## Format on save

To enable formatting on save, you need to set the `editor.formatOnSave` setting
to `true`. Find it under `File > Preferences > Settings`.
