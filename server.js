import { Mutex } from 'async-mutex';
import express from 'express';
import { dirname } from 'path';
import { AsyncDatabase } from 'promised-sqlite3';
import { fileURLToPath } from 'url';
import { applyChange } from './public/common.js';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = await AsyncDatabase.open('./db.sqlite');
const mutexLocks = {};
const mutexLocksLock = new Mutex(); // for when adding/removing locks in mutexLocks
const server = app.listen(8088);
const wss = new WebSocketServer({ server });

await db.run('CREATE TABLE IF NOT EXISTS "texts" ("id" INTEGER PRIMARY KEY, "path" TEXT, "text" TEXT, "changed_at" INTEGER, "change" TEXT)');
await db.run('CREATE INDEX IF NOT EXISTS "texts_path" ON "texts" ("path")');
prune();
setInterval(() => prune(), 1000 * 60 * 60 * 24); // everyday

app.use(express.static(__dirname + '/public'));

app.get('*', function (req, res) {
    let path = req.path.substring(1); // trim leading slash

    if (
        path.replace(/[^a-z0-9-]/gmi, '').length != path.length
        || path.includes('--')
        || path.startsWith('-')
        || path.endsWith('-')
    ) {
        res.status(404).sendFile(__dirname + '/public/invalid-path.html');
    } else {
        res.sendFile(__dirname + '/public/app.html');
    }
});

wss.on('connection', function (ws, req) {
    ws.on('error', console.error);

    ws.on('message', async function (message) {
        console.log(ws.path + ': received: %s', message);
        message = JSON.parse(message);

        if (message.clientVersion != undefined) {
            if (message.clientVersion == '0.0') {
                ws.isValid = true;
                let row = await db.get(
                    'SELECT * FROM "texts" WHERE "path" = ? AND "changed_at" > ? ORDER BY "changed_at" DESC',
                    ws.path,
                    (new Date).getTime() - 1000 * 60 * 60 * 24,
                );

                if (row == null) {
                    row = await db.get(
                        'SELECT * FROM "texts" WHERE "id" = ?',
                        (await db.run(
                            'INSERT INTO "texts" ("path", "text", "changed_at", "change") VALUES (?, \'\', ?, \'null\')',
                            ws.path,
                            (new Date).getTime(),
                        )).lastID
                    );
                }

                let message = {
                    version: row.id,
                    text: row.text,
                };

                ws.send(JSON.stringify(message));
            } else {
                ws.send(JSON.stringify({ message: 'Your client is out of date.' }));
                ws.close();
            }
        }

        if (message.type == 'insert' || message.type == 'delete') {
            let release = await mutexLocks[ws.path].acquire();
            let row = await db.get('SELECT * FROM "texts" WHERE "path" = ? ORDER BY "changed_at" DESC', ws.path);

            if (message.type == 'insert') {
                row.text = applyChange(row.text, message.position, 0, message.text);
            } else {
                row.text = applyChange(row.text, message.position, message.length, "");
            }

            await db.run('UPDATE "texts" SET "text" = ? WHERE "id" = ?', row.text, row.id);

            release();

            wss.clients.forEach(socket => {
                if (socket.isValid == false) return;
                if (socket.path != ws.path) return;
                socket.send(JSON.stringify(message));
            });
        } else if (message.type != undefined) {
            // bad message
            ws.send(JSON.stringify({ message: 'The message type is invalid.' }));
            ws.close();
        }
    });

    let path = req.url.replace(/(^\/)|(\/$)/, ''); // trim slashes
    ws.path = path;
    ws.isValid = false;

    mutexLocksLock.acquire().then(release => {
        mutexLocks[path] = new Mutex();
        release();
    });
});

console.log('Listening on :8088');

async function prune() {
    await db.run(
        'DELETE FROM "texts" WHERE "changed_at" < ?',
        (new Date).getTime() - 1000 * 60 * 60 * 24,
    );
    await db.run('VACUUM');

    // prune mutexLocks
    let release = await mutexLocksLock.acquire();
    let paths = (await db.all('SELECT DISTINCT "path" FROM "texts"')).map(row => row.path);
    Object.keys(mutexLocks).forEach(key => {
        if (!paths.includes(key)) {
            delete mutexLocks[key];
        }
    })
    release();
}
