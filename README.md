# VSCode reference client for the RLS

This repo provides the RLS client for vscode built using the Language 
Server protocol. This plugin will start the RLS for you, assuming it is in 
your path.


## Running

Git clone or download the files and use `npm install` in the directory to
download and install the required modules.

Next, without installing the client as a regular VSCode extension, open the
client folder in VSCode. Go to the debugger and run "Launch Extension". This
opens a new instance of VSCode with the plugin installed.


### Via Rustup

Before using this plugin, you can [install the RLS through rustup](https://github.com/rust-lang-nursery/rls#step-2-switch-to-nightly).


### Via Source

Check out the RLS source code, following the [directions](https://github.com/rust-lang-nursery/rls/blob/master/contributing.md). 
For the plugin to find the RLS, set the `RLS_ROOT` environment variable to the
root of your rls checkout:

```
export RLS_ROOT=/Source/rls
```

You can also add this export to your bash profile or equivalent.


### Via an executable

Similar to above, but use the `RLS_PATH` and point it at the RLS exectuble:

```
export RLS_PATH=/rls/target/release/rls
```

Note that you must include the name of the executable, not just the path.


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


## Installing in VSCode

If you'd like to test on multiple projects and already have the extension
working properly, you can manually install the extension so that it's loaded
into VSCode by default.

After following the above instructions, and successfully building the extension
once, build a .vsix archive by running the following:

```
npm install -g vsce
vsce package
```

Then, install it in VSCode from the Extensions tab menu, select "Install from VSIX..."

Restart VSCode in order to load the extension. More information available via
[VSCode docs](https://code.visualstudio.com/Docs/extensions/example-hello-world#_installing-your-extension-locally).


## Troubleshooting

### Error messages containing `tsc -watch -p ./` or `ENOSPC`

```
> npm ERR! Failed at the rls_vscode@0.0.1 compile script 'tsc -watch -p ./'.
> npm ERR! Make sure you have the latest version of node.js and npm installed.
> npm ERR! If you do, this is most likely a problem with the rls_vscode package,
> npm ERR! not with npm itself.
```

run

```
> npm dedupe
```

see http://stackoverflow.com/a/31926452/1103681 for an explanation

if that doesn't work, run

```
> echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```
