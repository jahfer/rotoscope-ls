#!/usr/bin/env node

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
	Diagnostic, DiagnosticSeverity, InitializeResult, TextDocumentPositionParams, CompletionItem,
	CompletionItemKind, MarkedString
} from 'vscode-languageserver';

import * as yargs from 'yargs';

import { Engine, Evaluation, EvaluationType } from './engine';

const cli = yargs
	.option('stdio', {
    describe: 'Use stdio to communicate with the server',
		type: 'string',
	})
	.option('node-ipc', {
    describe: 'Use node-ipc to communicate with the server. Useful for calling from a node.js client',
		type: 'string'
	});

const argv = cli.argv;
const options : { reader: any, writer: any } = { reader: null, writer: null };
const methods = ['node-ipc', 'stdio'];
const method = methods.find(m => argv[m] != null);

if (method == 'stdio') {
	console.log("Using stdio as reader/writer");
	options.reader = process.stdin;
	options.writer = process.stdout;
} else {
	console.log("Using ipc as reader/writer");
	options.reader = new IPCMessageReader(process);
	options.writer = new IPCMessageWriter(process);
}

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(options.reader, options.writer);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let engine: Engine = new Engine(documents);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
connection.onInitialize((_params): InitializeResult => {
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
			},
			hoverProvider: true
		}
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

connection.onHover((change) => {
	const evaluations : Evaluation[] = engine.evaluate(change);

	if (evaluations.length == 0) {
		return { contents: '' }
	}

	const markdown : MarkedString[] = evaluations.map((data: Evaluation) => {
		switch (data.evaluationType) {
			case EvaluationType.Class: return { language: 'ruby', value: `class ${data.name}` };
			case EvaluationType.Instance: return `(instance) ${data.class.name}`;
			case EvaluationType.Method:
				const separator = (data.method_level == 'class') ? '.' : '#'
				const caller_separator = (data.caller_method_level == 'class') ? '.' : '#'
				let mdStr = `(method) \`${data.entity}${separator}${data.method_name}\``;
				if (data.caller_entity != '<ROOT>')
					mdStr += `, called by: \`${data.caller_entity}${caller_separator}${data.caller_method_name}\``
				return mdStr;
			default:
				const _exhaustiveCheck: never = data;
				return _exhaustiveCheck;
		};
	});

	return { contents: markdown };
});

// The settings interface describe the server relevant settings part
interface Settings {
	maxNumberOfProblems: number;
	pathToRotoscopeExport: string;
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.maxNumberOfProblems || 100;
	const default_path = `/Users/jahfer/src/throwaway/rotoscope-ls/example_project/.rotoscope`;
	engine.seed(settings.pathToRotoscopeExport || default_path);

	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});

function validateTextDocument(textDocument: TextDocument): void {
	let diagnostics: Diagnostic[] = [];
	let lines = textDocument.getText().split(/\r?\n/g);
	let problems = 0;
	for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
		let line = lines[i];
		let index = line.indexOf('typescript');
		if (index >= 0) {
			problems++;
			diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				range: {
					start: { line: i, character: index },
					end: { line: i, character: index + 10 }
				},
				message: `${line.substr(index, 10)} should be spelled TypeScript`,
				source: 'ex'
			});
		}
	}
	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We recevied an file change event');
});


// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2
		}
	]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details',
			item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
			item.documentation = 'JavaScript documentation'
	}
	return item;
});

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();

if (method == 'stdio') {
	process.stdin.on('close', () => {
		process.exit(0);
	});
}
