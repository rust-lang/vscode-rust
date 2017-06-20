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


## Adding a Build Command

You can add a build command pretty easily with VSCode. Commands are done through
the [Tasks](https://code.visualstudio.com/docs/editor/tasks) system.

To add a build command for Rust, first pull up the command palette (for macOS
it's Command+Shift+P). Search for "Tasks: Configure Task Runner".

This will open the `tasks.json` file. Change this file to, for example:

```
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "0.1.0",
    "command": "cargo",
    "isShellCommand": true,
    "args": ["build"],
    "showOutput": "always"
}
```

After this, you'll have a build command you can invoke. On macOS, for example,
this build command is invoked through Command+Shift+B.


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
