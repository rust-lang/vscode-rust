# VSCode reference client for the RLS

This repo provides the RLS client for vscode built using the Language 
Server protocol. This plugin will start the RLS for you, assuming it is in 
your path.

## Instructions

Git clone or download the files and use `npm install` in
the directory to download and install the required modules. 

Next, without installing the client as a regular VSCode extension, open the
client folder in VSCode. Go to the debugger and run "Launch Extension". This
opens a new instance of VSCode with the plugin installed.

For the plugin to find the RLS, be sure to set your `RLS_ROOT` environment
variable to the root of your rls checkout:

```
export RLS_ROOT=/Source/rls
```  
You can also add this export to your bash profile or equivalent.

## Manually add as regular VSCode extension

If you'd like to test on multiple projects and already have the extension working properly, you can manually install the extension so that it's loaded into VSCode by default.

After following the above instructions, and successfully building the extension once, symlink or copy the `rls_vscode` directory to either:
```
Windows: %USERPROFILE%\.vscode\extensions
Mac/Linux: $HOME/.vscode/extensions
```
For example, to setup a symlink on Mac/Linux: `ln -s /path/to/rls_vscode/ ~/.vscode/extensions/rls_vscode`
Restart VSCode in order to load the extension. More information available via [VSCode docs](https://code.visualstudio.com/Docs/extensions/example-hello-world#_installing-your-extension-locally).
