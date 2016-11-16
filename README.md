# VSCode reference client for the RLS

This repo provides the RLS client for vscode built using the Language 
Server protocol. This plugin will start the RLS for you, assuming it is in 
your path.

## Instructions

Git clone or download the files, and for either client, use `npm install` in
their respective directories to download and install the required modules. 

Next, without installing the client as a regular VSCode extension, open the
client folder in VSCode. Go to the debugger and run "Launch Extension". This
opens a new instance of VSCode with the plugin installed. For the LS client,
you must start VSCode in the *RLS* home directory.

