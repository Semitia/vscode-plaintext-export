# Plaintext Export

A small VS Code extension created as a practice project. It exports editor text
to `.log` files and includes a few convenient folder operations.

## Features

- Export the active document beside its source as `<filename>.log`.
- Recursively export common text and source files to a sibling `<folder>.logs`
  directory while preserving the source tree.
- Recursively remove the appended `.log` suffix without overwriting existing
  destination files.
- Run folder commands from the Command Palette or Explorer context menu.

For example, exporting `project/subdir/example.cpp` produces
`project.logs/subdir/example.cpp.log`.

## Usage

Open the Command Palette with `Ctrl+Shift+P`, then run one of these commands:

- `Plaintext Export: Export Active Document to .log`
- `Plaintext Export: Export Text Folder`
- `Plaintext Export: Remove .log Suffixes in Folder`

The recursive commands can also be run by right-clicking a folder in Explorer.
When removing suffixes, conflicts are skipped and reported in the
`Plaintext Export` Output channel.

## Performance and configuration

Directory scanning is parallelized. After opening each document, the extension
waits briefly for other editor integrations to finish updating its content.

`plaintextExport.documentSettleDelayMs` controls the maximum wait per document
and defaults to `250`. Set it to `0` for maximum speed when no extra settling
time is needed.

## Development

Open this directory in VS Code and press `F5` to start an Extension Development
Host. Reload the development window after changing `extension.js`.

The extension requires VS Code 1.75 or newer and has no runtime dependencies.
