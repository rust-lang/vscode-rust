### Unreleased

### 0.7.8 - 2020-05-13

* Rebrand extension as RLS-agnostic
* Add missing semantic token types definition

### 0.7.7 - 2020-05-13

* Only synchronize relevant workspace settings for RLS
* Rename configuration section to just "Rust"

### 0.7.6 - 2020-05-12

* Support rust-analyzer as an alternate LSP server
* Bump required VSCode version to 1.43, use language server protocol (LSP) v3.15

### 0.7.5 - 2020-05-06

* Remove redundant snippets and improve usability of select ones e.g. `if let`
* Accept rustup toolchain shorthands in `rust-client.channel`, e.g. `stable-gnu` or `nightly-x86_64-msvc`
* Remove deprecated `rust-client.useWsl` setting (use the official
[Remote - WSL](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl) extension instead)

### 0.7.4 - 2020-04-27

* Add a Start/Stop the RLS command
* Introduce a `rust-client.autoStartRls` (defaults to true) setting to control the auto-start
behaviour when opening a relevant Rust project file
* (!) Don't immediately start server instances for every already opened file
* (!) Don't immediately start server instances for newly added workspace folders
* Dynamically show progress only for the active client workspace
* Correctly run tasks based on active text editor rather than last opened Rust file
* Use smooth, universally supported spinner in the status bar ⚙️

### 0.7.3 - 2020-04-21

* Remove redundant `rust-client.nestedMultiRootConfigInOutermost` setting (originally used to work around non-multi-project limitations)
* Ignore setting `rust-client.enableMultiProjectSetup` (it's always on by default)
* Fix support for multiple VSCode workspaces

### 0.7.2 - 2020-04-17

* Fix a bug where rustup didn't install all of the required components for the RLS
* Don't warn on custom `rust-client.channel` value such as `1.39.0` in properties.json
* Add a new `default` value for `rust-client.channel` (same as setting it explicitly to `null`)
* Add a self-closing angular (`>`) bracket whenever opening one (`<`) has been typed
* Refresh the RLS spinner 🌕
* Fix project layout detection bugs on Windows when using the `enableMultiProjectSetup` option
* Prevent hover with function signature from being shown when declaring the function

### 0.7.1 - 2020-04-16

* Limit scope of few extension-specific settings to `machine`
* Bump required VSCode to 1.36
* Change `thread::spawn` snippet to activate on `thread_spawn` prefix
* Use dynamic `wait_to_build` in RLS by default rather than setting it to 1500ms

### 0.7.0 - 2019-10-15

* Implement support for multi-project workspace layout 🎉
* Remove deprecated `rust.use_crate_blacklist` configuration entry

#### Contributors
This minor release was possible thanks to:
* Alex Tugarev
* Igor Matuszewski
* Jannick Johnsen
* lwshang
* Nickolay Ponomarev

(Generated via `git shortlog -s --no-merges 0.6.0...0.7.0 | cut -f2 | sort`)

### 0.6.3 - 2019-09-07

* Fix `rust-client.channel` config type in package.json

### 0.6.2 - 2019-09-04

* Deprecate `rust.use_crate_blacklist` in favor of newly added `rust.crate_blacklist` (supported by RLS 1.38)
* Expand `~` in `rust-client.{rustup,rls}Path` settings
* Deprecate `rust-client.useWSL` setting (use [Remote - WSL](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl) extension instead)

### 0.6.1 - 2019-04-04

* Fix Cargo task auto-detection

### 0.6.0 - 2019-04-01

#### Features/Changes
* Implement function signature help tooltip
* Updat `print(ln)` macro snippets
* Introduce `rust-client.nestedMultiRootConfigInOutermost`
* Show Rust toolchain/RLS component installation progress with user-visible task pane

#### Fixes
* Fix overriding Rustup-enabled RLS with custom `rust-client.rlsPath` setting
* Fix duplicated diagnostics originating from the build tasks
* Spawn RLS at the respective workspace folder
* Fix `rust-client.logToFile` on Windows
* Fix ``Unknown RLS configuration: `trace``
* Let Racer generate and use its `RUST_SRC_PATH` env var
* Remove support for deprecated `rustDocument/{beginBuild,diagnosticsEnd}` messages
* Surface and handle more erorrs wrt. RLS spawn error
* Stop warning against deprecated `RLS_{PATH,ROOT}` env vars
* Stop warning against deprecated `rls.toml`
* Don't change `$PATH` for the VSCode process when modifying it for the RLS
* Fix URI path conversion in Problems Pane on Windows

#### Contributors
This release was possible thanks to:
* Bastian Köcher
* Igor Matuszewski
* John Feminella
* Przemysław Pietrzkiewicz
* Radu Matei
* Ricardo
* SoftwareApe
* TheGoddessInari
* angusgraham
* enzovitaliy

### 0.5.4 - 2019-03-09

* Fix bug due to Rustup changes in 1.17
* Remove `goto_def_racer_fallback` (replaced with `racer_completion`)
* Add WSL support

### 0.5.3 - 2018-12-08

* Revert Cargo.toml changes

### 0.5.2 - 2018-12-07

* Prefer workspace Cargo.toml to local ones

### 0.5.1 - 2018-12-06

* Try harder to find Cargo.toml
* Account for the `rls-preview` to `rls` component name change (and remove the `rust-client.rls-name` option)

### 0.5.0 - 2018-12-04

* Added `build_command` setting
* Work better without Rustup
* Fix some bugs with VSCode workspaces


### 0.4.10 - 2018-08-29

* Can use an external Rustfmt using `rust.rustfmt_path` option
* snippets for test, derive, and cfg
* fix a bug where the Rust sysroot was set to an invalid value

### 0.4.9 - 2018-07-20

* Fix a bug in the `rust.clippy_preference` setting.

### 0.4.8 - 2018-07-20

* Fix some Windows bugs
* add the `rust.clippy_preference` setting.
* Fix some Rustup/installation bugs

### 0.4.7 - 2018-07-08

* Fix missing tasks in recent versions of VSCode

### 0.4.6 - 2018-07-05

* Support VSCode workspaces
* Code lens for running unit tests

### 0.4.5 - 2018-06-03

* Undo the change to target directory default (unnecessary with Rust 1.26.1)

### 0.4.4 - 2018-05-17

* Update the VSCode client library dependency
* Fix the target directory

### 0.4.3 - 2018-05-14

* Set the target directory default to work around a but in the stable RLS
* `extern crate` snippet
* remove non-workspace mode

### 0.4.2 - 2018-04-29

* Added `rust-client.rlsPath` setting for easier RLS development and debugging
  (and deprecated the `rls.path` setting)
* Bug fixes for race conditions.
* Increased the default `rust.wait_to_build` time.
* Updated LS client
* Added `cargo bench` task
* Added `rust.target_dir` and `rust.all_targets` settings


### 0.4.0 - 2018-03-04

* Added `rust.racer_completion` to allow disabling racer to work around a
  [performance issue](https://github.com/rust-lang-nursery/rls/issues/688).
* Spinner UI improvements.
* Added a `cargo check` task.
* The local active toolchain channel is now the default `rust-client.channel`.
* Added `rust.jobs` to allow limiting the number of parallel Cargo jobs.
* Added support for workspaces.
* Improved startup experience when using workspaces.
* Deglob is now a code action instead of a command.
* Warns and no longer crashes RLS if a single file is opened instead of a
  folder.
* Warns if Cargo.toml is not in the root of a workspace.

### 0.3.2 - 2017-11-07

* Added `rust-client.rustupPath` to override rustup location.
* Added properties to control enabling of Cargo features.
* Fixed an issue where nightly was used instead of the configured channel.

### 0.3.1 - 2017-10-04

* Bug fix in RLS detection.

### 0.3.0 - 2017-09-29

* Change the default for `rust-client.rls-name` to `rls-preview` to handle the
  renaming of the RLS.
* Remove `rust-client.showStdErr` property.

### 0.2.3 - 2017-09-21

* Warns if Config.toml is missing (likely due to opening a Rust file outside a
  project, which previously crashed)
* Automatically continue line comments
* Automatically set LD_LIBRARY_PATH (only useful when not using Rustup)
* Configure the toolchain and component name for the RLS
* Command to restart the RLS
* Better workflow around creating build tasks
* A better logo - more colour!

### 0.2.2 - 2017-08-21

* Highlights errors from build tasks
* Find all impls
* Adds cargo clean task
* Auto-detect `--lib` or `--bin`
* Adds an opt-out option for creating tasks.json
* Add a command to update the RLS and an option to do so on startup
* Deprecate `RLS_PATH` and `RLS_ROOT` env vars
* Changes to the RLS:
  - Easier to use deglob refactoring
  - Debugging and troubleshooting [instructions](https://github.com/rust-lang-nursery/rls/blob/master/debugging.md)

### 0.2.1 - 2017-08-09

* Fix bug installing the rls

### 0.2.0 - 2017-08-07

* Unicode (fixed width) spinner
* Logging and debugging options in configuration
* Deglob command is in the Rust category
* Don't check tests by default (still configurable)
* Set `RUST_SRC_PATH` for Racer
* Travis CI for the repo
* Performance and robustness improvements in the RLS, support for required options
  here, including
  - blacklist large and non-very useful crates (configurable)
  - configure compiler data
  - don't error on missing options
  - stabilise renaming
  - don't crash on non-file URLs
  - Racer and Rustfmt updates
  - only use Racer for code completion (never for 'goto def', still configurable)
  - improve startup build/index time
  - handle stale compiler data better
  - add an option to only build/index on save (not on change)
  - rebuild if Cargo.toml changes

### 0.1.0 - 2017-07-17

* First release
