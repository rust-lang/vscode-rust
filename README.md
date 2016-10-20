# VSCode reference clients for the RLS

This repo provides two clients, one for the RLS custom http protocol and one
using the Language Server protocol. You must setup the RLS to match the client.
For the http client, this means using the `--http` flag when starting the RLS.
The LS client will start the RLS for you.

## Instructions

Git clone or download the files, and for either client, use `npm install` in
their respective directories to download and install the required modules. 

Next, without installing the client as a regular VSCode extension, open the
client folder in VSCode. Go to the debugger and run "Launch Extension". This
opens a new instance of VSCode with the plugin installed. For the LS client,
you must start VSCode in the *RLS* home directory.
