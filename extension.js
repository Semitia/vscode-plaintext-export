const vscode = require('vscode');
const path = require('path');

const textEncoder = new TextEncoder();
const DIRECTORY_SCAN_CONCURRENCY = 32;
const COPY_CONCURRENCY = 16;
const RENAME_CONCURRENCY = 16;

const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
  '.cs', '.java', '.kt', '.kts', '.go', '.rs', '.swift',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.pyw', '.rb', '.php', '.pl', '.pm', '.lua', '.r',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.json', '.jsonc', '.xml', '.yaml', '.yml', '.toml', '.ini',
  '.cfg', '.conf', '.properties', '.env', '.csv', '.tsv',
  '.md', '.markdown', '.txt', '.log', '.sql', '.graphql', '.proto',
  '.cmake', '.gradle', '.dockerfile', '.editorconfig', '.gitignore'
]);

const TEXT_FILENAMES = new Set([
  'makefile', 'dockerfile', 'cmakelists.txt', 'readme', 'license',
  '.gitignore', '.gitattributes', '.editorconfig', '.env'
]);

function isTextCandidate(name) {
  const lowerName = name.toLowerCase();
  return TEXT_FILENAMES.has(lowerName) ||
    TEXT_EXTENSIONS.has(path.extname(lowerName));
}

async function exportActiveDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('No active text editor.');
    return;
  }

  const document = editor.document;
  if (document.uri.scheme !== 'file') {
    void vscode.window.showErrorMessage('The active document is not a local file.');
    return;
  }

  const outputUri = vscode.Uri.file(`${document.uri.fsPath}.log`);
  const content = textEncoder.encode(document.getText());

  try {
    await vscode.workspace.fs.writeFile(outputUri, content);
    const action = await vscode.window.showInformationMessage(
      `Exported ${content.byteLength} bytes to ${outputUri.fsPath}`,
      'Open File'
    );

    if (action === 'Open File') {
      const exported = await vscode.workspace.openTextDocument(outputUri);
      await vscode.window.showTextDocument(exported, { preview: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Export failed: ${message}`);
  }
}

async function collectFiles(directory, predicate) {
  const result = [];
  const pendingDirectories = [{ uri: directory, relativePath: '' }];

  while (pendingDirectories.length > 0) {
    const batch = pendingDirectories.splice(0, DIRECTORY_SCAN_CONCURRENCY);
    const listings = await Promise.all(batch.map(async (item) => ({
      item,
      entries: await vscode.workspace.fs.readDirectory(item.uri)
    })));

    for (const { item, entries } of listings) {
      for (const [name, type] of entries) {
        const child = vscode.Uri.joinPath(item.uri, name);
        const childRelativePath = path.join(item.relativePath, name);

        if ((type & vscode.FileType.Directory) !== 0 &&
            (type & vscode.FileType.SymbolicLink) === 0) {
          pendingDirectories.push({ uri: child, relativePath: childRelativePath });
        } else if ((type & vscode.FileType.File) !== 0 && predicate(name)) {
          result.push({ uri: child, relativePath: childRelativePath });
        }
      }
    }
  }

  return result;
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    }
  );
  await Promise.all(workers);
}

function showFailures(title, failures) {
  if (failures.length === 0) {
    return;
  }
  const channel = vscode.window.createOutputChannel('Plaintext Export');
  channel.appendLine(title);
  channel.appendLine(failures.join('\n'));
  channel.show(true);
}

async function exportFolderTree(sourceUri) {
  if (!sourceUri) {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Export text files from this folder'
    });
    sourceUri = selection?.[0];
  }

  if (!sourceUri || sourceUri.scheme !== 'file') {
    return;
  }

  const sourcePath = sourceUri.fsPath.replace(/[\\/]+$/, '');
  const outputUri = vscode.Uri.file(`${sourcePath}.logs`);
  const files = await collectFiles(sourceUri, isTextCandidate);
  let exported = 0;
  let completed = 0;
  const failures = [];
  const directoryPromises = new Map();

  const ensureDirectory = async (directory) => {
    const key = directory.fsPath.toLowerCase();
    if (!directoryPromises.has(key)) {
      directoryPromises.set(key, vscode.workspace.fs.createDirectory(directory));
    }
    await directoryPromises.get(key);
  };

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Exporting text documents',
    cancellable: false
  }, async (progress) => {
    await runWithConcurrency(files, COPY_CONCURRENCY, async (file) => {
      try {
        const destination = vscode.Uri.joinPath(
          outputUri,
          ...`${file.relativePath}.log`.split(path.sep)
        );
        const destinationDirectory = vscode.Uri.file(path.dirname(destination.fsPath));
        await ensureDirectory(destinationDirectory);
        await vscode.workspace.fs.copy(file.uri, destination, { overwrite: true });
        exported += 1;
      } catch (error) {
        failures.push(`${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        completed += 1;
        progress.report({
          message: `${completed}/${files.length}`,
          increment: files.length === 0 ? 100 : 100 / files.length
        });
      }
    });
  });

  const detail = failures.length > 0
    ? ` ${failures.length} failed; see the Output panel.`
    : '';
  void vscode.window.showInformationMessage(
    `Exported ${exported}/${files.length} text files to ${outputUri.fsPath}.${detail}`
  );

  showFailures('Folder export failures:', failures);

  return { sourceUri, outputUri, total: files.length, exported, failures };
}

async function removeLogSuffixes(folderUri) {
  if (!folderUri) {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Remove .log suffixes in this folder'
    });
    folderUri = selection?.[0];
  }

  if (!folderUri || folderUri.scheme !== 'file') {
    return;
  }

  const files = await collectFiles(folderUri, (name) => name.toLowerCase().endsWith('.log'));
  let renamed = 0;
  const failures = [];
  let completed = 0;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Removing .log suffixes',
    cancellable: false
  }, async (progress) => {
    await runWithConcurrency(files, RENAME_CONCURRENCY, async (file) => {
      const destination = vscode.Uri.file(file.uri.fsPath.slice(0, -4));
      try {
        await vscode.workspace.fs.rename(file.uri, destination, { overwrite: false });
        renamed += 1;
      } catch (error) {
        failures.push(`${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        completed += 1;
        progress.report({
          message: `${completed}/${files.length}`,
          increment: files.length === 0 ? 100 : 100 / files.length
        });
      }
    });
  });

  const detail = failures.length > 0
    ? ` ${failures.length} skipped; see the Output panel.`
    : '';
  void vscode.window.showInformationMessage(
    `Removed .log suffixes from ${renamed}/${files.length} files in ${folderUri.fsPath}.${detail}`
  );
  showFailures('Remove .log suffix failures:', failures);

  return { folderUri, total: files.length, renamed, failures };
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'plaintextExport.exportActiveDocument',
      exportActiveDocument
    ),
    vscode.commands.registerCommand(
      'plaintextExport.exportFolderTree',
      exportFolderTree
    ),
    vscode.commands.registerCommand(
      'plaintextExport.removeLogSuffixes',
      removeLogSuffixes
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
