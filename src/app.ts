/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { APP_NAME, APP_VERSION, ClientMessage, DeletionMessageFromClient, InsertionMessageFromClient, RegistrationMessage, applyChange } from './common.ts';

const path: string = location.pathname.substring(1); // trim leading slash
const href: string = function () {
	let href = location.href;
	if (href.includes('?')) href = href.substring(0, href.indexOf('?'));
	return href;
}();
const wsAddress: string = href.replace(/^http/i, 'ws');
const placeholder: string = `Type something.\n\nThis text area is synchronized with everyone else at ${href}. The text will be deleted 24 hours after last modification.\n\nVersion: ${APP_VERSION}`;
const textarea: HTMLTextAreaElement = document.createElement('textarea');

const serverMessages: Array<string> = [];
const localChanges: Record<string, ClientMessage> = {};
const ws = new WebSocket(wsAddress);
var waitingForExistingText: boolean = true;

console.log(`APP_VERSION=${APP_VERSION}`);

textarea.placeholder = 'Loading existing text, if any...';
textarea.disabled = true;
textarea.autofocus = true;
document.body.append(textarea);
document.querySelector('div.loading')?.remove();
document.title = `${path} - ${APP_NAME}`;

ws.onopen = () => {
	ws.send(JSON.stringify(<RegistrationMessage>{ clientVersion: APP_VERSION }));
};

ws.onclose = ws.onerror = () => {
	textarea.disabled = true;
	textarea.value = '';
	let placeholder = 'No connection; refresh the page.';
	if (serverMessages.length > 0) {
		placeholder += "\n\nServer message(s):\n";
		placeholder += serverMessages.map(string => "- " + string).join("\n");
	}
	textarea.placeholder = placeholder;
};

ws.onmessage = event => {
	let message = JSON.parse(event.data);
	if (message.message != undefined) serverMessages.push(message.message);

	if (localChanges[message.id] != undefined) {
		delete localChanges[message.id];
		return;
	}

	if (message.text !== undefined && waitingForExistingText == true) {
		waitingForExistingText = false;

		textarea.value = message.text;
		textarea.disabled = false;
		textarea.placeholder = placeholder;
	} else if ('text' in message) {
		message.length = message.text.length;
		message.end = message.position + message.length;

		let oldCursorPosition = {
			start: textarea.selectionStart,
			end: textarea.selectionEnd,
			direction: textarea.selectionDirection,
		};
		textarea.value = applyChange(
			textarea.value,
			message.position,
			0,
			message.text,
		);

		if (oldCursorPosition.start > message.position) {
			oldCursorPosition.start += message.length;
		}

		if (oldCursorPosition.end > message.position) {
			oldCursorPosition.end += message.length;
		}

		textarea.setSelectionRange(oldCursorPosition.start, oldCursorPosition.end, oldCursorPosition.direction);
	} else {
		message.end = message.position + message.length;

		let oldCursorPosition = {
			start: textarea.selectionStart,
			end: textarea.selectionEnd,
			direction: textarea.selectionDirection,
		};
		textarea.value = applyChange(
			textarea.value,
			message.position,
			message.length,
			'',
		);

		if (oldCursorPosition.start > message.position && oldCursorPosition.start <= message.end) {
			oldCursorPosition.start = message.position;
		} else if (oldCursorPosition.start > message.end) {
			oldCursorPosition.start -= message.length;
		}

		if (oldCursorPosition.end > message.position && oldCursorPosition.end <= message.end) {
			oldCursorPosition.end = message.position;
		} else if (oldCursorPosition.end > message.end) {
			oldCursorPosition.end -= message.length;
		}

		textarea.setSelectionRange(oldCursorPosition.start, oldCursorPosition.end, oldCursorPosition.direction);
	}
};

textarea.onbeforeinput = event => {
	const target = <HTMLTextAreaElement>event.target;
	const data: Array<InsertionMessageFromClient | DeletionMessageFromClient> = [];
	const selection = {
		start: Math.min(target.selectionStart, target.selectionEnd),
		length: Math.abs(target.selectionStart - target.selectionEnd)
	};
	let replacementText = event.data ?? '';

	if (event.inputType == 'deleteContentBackward' && selection.start > 0 && selection.length == 0) {
		selection.start--;
		selection.length++;
	} else if (event.inputType == 'deleteContentForward' && selection.start < target.value.length - 1 && selection.length == 0) {
		selection.length++;
	} else if (event.inputType == 'insertLineBreak') {
		replacementText = "\n";
	}

	// convert replacement with separate delete/insert events

	if (selection.length > 0 && replacementText.length > 0) { // is a replacement
		if (replacementText != '') {
			data[1] = {
				id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
				position: selection.start,
				text: replacementText,
			};
		}
		data[0] = {
			id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
			position: selection.start,
			length: selection.length,
		};
	} else if (selection.length > 0) { // is a delete
		data[0] = {
			id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
			position: selection.start,
			length: selection.length,
		};
	} else { // is an insert
		if (replacementText != '') {
			data[0] = {
				id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
				position: selection.start,
				text: replacementText,
			};
		} else {
			delete data[0];
		}
	}

	console.log(data);
	data.forEach(message => {
		localChanges[message.id] = message;
		ws.send(JSON.stringify(message));
	});
};
