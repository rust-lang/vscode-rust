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
