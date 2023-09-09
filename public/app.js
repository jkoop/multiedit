import { applyChange } from './common.js';

const appName = 'MultiEdit';
const version = '0.0';

var path = location.pathname.substring(1); // trim leading slash
var href = location.href;
if (href.includes('?')) href = href.substring(0, href.indexOf('?'));

const placeholder = `Type something.\n\nThis text area is synchronized with everyone else at ${href}. The text will be deleted 24 hours after last modification.\n\nVersion: ${version}`;

document.body.innerHTML += `<textarea autofocus disabled placeholder="Loading existing text, if any..."></textarea>`;
document.querySelector('div.loading').remove();
document.title = path + ' - ' + appName;

const textarea = document.querySelector('textarea');
var serverMessages = [];
var localChanges = [];

var haveText = false;

var ws = new WebSocket('ws://localhost:8088/' + path);
ws.onopen = event => {
    ws.send(JSON.stringify({ clientVersion: version }));
};
ws.onclose = ws.onerror = event => {
    textarea.disabled = true;
    textarea.value = '';
    let placeholder = 'No connection; refresh the page.';
    if (serverMessages.length > 0) {
        placeholder += "\n\nServer message(s):\n";
        placeholder += serverMessages.map(string => "- " + string).join("\n");
    }
    textarea.placeholder = placeholder;
}

ws.onmessage = event => {
    let data = JSON.parse(event.data);
    if (data.message != undefined) serverMessages.push(data.message);

    if (localChanges[data.id] != undefined) {
        localChanges[data.id] = undefined;
        return;
    }

    if (data.text !== undefined && haveText == false) {
        haveText = true;

        textarea.value = data.text;
        textarea.disabled = false;
        textarea.placeholder = placeholder;
    } else if (data.type == 'delete') {
        data.end = data.position + data.length;

        let oldCursorPosition = {
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
            direction: textarea.selectionDirection,
        };
        textarea.value = applyChange(
            textarea.value,
            data.position,
            data.length,
            '',
        );

        if (oldCursorPosition.start > data.position && oldCursorPosition.start <= data.end) {
            oldCursorPosition.start = data.position;
        } else if (oldCursorPosition.start > data.end) {
            oldCursorPosition.start -= data.length;
        }

        if (oldCursorPosition.end > data.position && oldCursorPosition.end <= data.end) {
            oldCursorPosition.end = data.position;
        } else if (oldCursorPosition.end > data.end) {
            oldCursorPosition.end -= data.length;
        }

        textarea.setSelectionRange(oldCursorPosition.start, oldCursorPosition.end, oldCursorPosition.direction);
    } else if (data.type == 'insert') {
        data.length = data.text.length;
        data.end = data.position + data.length;

        let oldCursorPosition = {
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
            direction: textarea.selectionDirection,
        };
        textarea.value = applyChange(
            textarea.value,
            data.position,
            0,
            data.text,
        );

        if (oldCursorPosition.start > data.position) {
            oldCursorPosition.start += data.length;
        }

        if (oldCursorPosition.end > data.position) {
            oldCursorPosition.end += data.length;
        }

        textarea.setSelectionRange(oldCursorPosition.start, oldCursorPosition.end, oldCursorPosition.direction);
    } else {
        console.error('received invalid message type', data.type);
    }
}

textarea.onbeforeinput = event => {
    console.log(event);

    let data = [{
        selection: {
            start: Math.min(event.target.selectionStart, event.target.selectionEnd),
            length: Math.abs(event.target.selectionStart - event.target.selectionEnd)
        },
        replacementText: event.data ?? '',
    }];

    if (event.inputType == 'deleteContentBackward' && data[0].selection.start > 0 && data[0].selection.length == 0) {
        data[0].selection.start--;
        data[0].selection.length++;
    } else if (event.inputType == 'deleteContentForward' && data[0].selection.start < event.target.value.length - 1 && data[0].selection.length == 0) {
        data[0].selection.length++;
    } else if (event.inputType == 'insertLineBreak') {
        data[0].replacementText = "\n";
    }

    // convert replacement with separate delete/insert events

    if (data[0].selection.length > 0 && data[0].replacementText.length > 0) { // is a replacement
        if (data[0].replacementText != '') {
            data[1] = {
                id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
                type: 'insert',
                position: data[0].selection.start,
                text: data[0].replacementText,
            };
        }
        data[0] = {
            id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
            type: 'delete',
            position: data[0].selection.start,
            length: data[0].selection.length,
        }
    } else if (data[0].selection.length > 0) { // is a delete
        data[0] = {
            id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
            type: 'delete',
            position: data[0].selection.start,
            length: data[0].selection.length,
        }
    } else { // is an insert
        if (data[0].replacementText != '') {
            data[0] = {
                id: (new Date).getTime() + ":" + Math.round(Math.random() * 1e10),
                type: 'insert',
                position: data[0].selection.start,
                text: data[0].replacementText,
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
}
