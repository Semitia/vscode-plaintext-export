# Plaintext Export

A small VS Code extension created as a practice project. It exports editor text
to `.log` files and includes a few convenient folder operations.

## Features

- Export the active document beside its source as `<filename>.log`.
- Recursively export common text and source files to a sibling `<folder>.logs`
  directory while preserving the source tree. Folder exports run headlessly and
  never open files in editor tabs.
- Optionally use conservative folder scanning. This excludes extensions known
  to be binary, then samples every other file (including extensionless and
  unknown-extension files) so uncommon plain-text formats are not missed.
- Include text-based Visual Studio solution, project, MSBuild, resource, and
  debugger configuration files, such as `.sln`, `.slnf`, `.csproj`,
  `.vcxproj`, `.props`, `.targets`, `.resx`, and `.natvis`. Binary Visual
  Studio artifacts such as `.suo` and `.pdb` are excluded.
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

Set `Plaintext Export: Folder Scan Mode` to `conservative` in VS Code settings
to enable content probing. The default `knownText` mode is faster and preserves
the extension allowlist behavior.

## Performance

Directory scanning and file copying are parallelized. Folder export copies file
bytes directly through the VS Code file-system API, so it does not activate
language tooling for each file or change the active editor.

## Development

Open this directory in VS Code and press `F5` to start an Extension Development
Host. Reload the development window after changing `extension.js`.

The extension requires VS Code 1.75 or newer and has no runtime dependencies.
