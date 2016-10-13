# VSCode reference clients for the RLS

This repo provides two clients, one for the RLS custom http protocol and one
using the Language Server protocol. You must setup the RLS to match the client.
For the http client, this means using the `--http` flag when starting the RLS.
The LS client will start the RLS for you.

For either client, use `npm install` to get the required modules.

Open the client in VSCode and run with 'debug' to open a new VSCode with the
plugin installed. For the LS client, you must start VSCode in the *RLS* home
directory.
