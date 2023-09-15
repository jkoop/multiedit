import { Mutex, MutexInterface } from 'async-mutex';
import { ServerWebSocket } from "bun";
import { Database, Statement } from "bun:sqlite";
import { existsSync } from "fs";
import { applyChange, APP_VERSION, ClientMessage } from './common.ts';

const db = new Database("db.sqlite", { create: true });
const mutexLocks: Record<string, Mutex> = {};
const mutexLocksLock = new Mutex; // for when adding/removing locks in mutexLocks
const sockets: Record<string, Set<ServerWebSocket>> = {};

interface WebSocketData {
	isValid: boolean;
	path: string;
};

interface DbTextRow {
	id: number;
	path: string;
	text: string;
	changed_at: number;
	change: string | Object;
}

const dbGetLatestText: Statement = db.prepare('SELECT * FROM "texts" WHERE "path" = ? AND "changed_at" > ? ORDER BY "changed_at" DESC LIMIT 1');
const dbInsertText: Statement = db.prepare('INSERT INTO "texts" ("path", "text", "changed_at", "change") VALUES (?, ?, ?, ?)');
const dbPrune: Statement = db.prepare('DELETE FROM "texts" WHERE "changed_at" < ?');
const dbVacuum: Statement = db.prepare('VACUUM');

db.prepare('CREATE TABLE IF NOT EXISTS "texts" ("id" INTEGER PRIMARY KEY, "path" TEXT, "text" TEXT, "changed_at" INTEGER, "change" TEXT)').run();
db.prepare('CREATE INDEX IF NOT EXISTS "texts_path" ON "texts" ("path")').run();
setInterval(() => prune(), 1000 * 60 * 60 * 24); // everyday
prune();

async function prune() {
	dbPrune.run((new Date).getTime() - 1000 * 60 * 60 * 24);
	dbVacuum.run();
}

const server = Bun.serve({
	fetch(req) {
		const path: string = (new URL(req.url)).pathname.substring(1); // trim leading slash

		// upgrade the request to a WebSocket
		if (server.upgrade(req, { data: { isValid: false, path } })) {
			return;
		}

		if (path == '') {
			return new Response(Bun.file("./build/index.html"));
		} else if (!path.includes('..') && existsSync(`./build/${path}`)) {
			return new Response(Bun.file(`./build/${path}`));
		} else if (
			path.replace(/[^a-z0-9-]/gmi, '').length != path.length
			|| path.includes('--')
			|| path.startsWith('-')
			|| path.endsWith('-')
		) {
			return new Response(Bun.file("./build/invalid-path.html"));
		} else {
			return new Response(Bun.file("./build/app.html"));
		}
	},
	websocket: {
		async open(ws: ServerWebSocket): Promise<void> {
			if (ws.data == undefined) return;
			const wsData = <WebSocketData>ws.data;
			const path: string = wsData.path;
			let release: MutexInterface.Releaser;

			release = await mutexLocksLock.acquire();
			if (mutexLocks[path] === undefined) mutexLocks[path] = new Mutex;
			release();

			release = await mutexLocks[path].acquire();
			if (sockets[path] === undefined) sockets[path] = new Set;
			sockets[path].add(ws);
			release();
		},
		async close(ws: ServerWebSocket): Promise<void> {
			if (ws.data == undefined) return;
			const wsData = <WebSocketData>ws.data;
			const path: string = wsData.path;
			let release: MutexInterface.Releaser;

			release = await mutexLocksLock.acquire();
			if (mutexLocks[path] === undefined) mutexLocks[path] = new Mutex;
			release();

			release = await mutexLocks[path].acquire();
			sockets[path].delete(ws);
			if (sockets[path].size == 0) delete sockets[path];
			release();
		},
		async message(ws: ServerWebSocket, messageString: string): Promise<void> {
			if (ws.data == undefined) return;
			const wsData = <WebSocketData>ws.data;
			const path: string = wsData.path;
			const message = <ClientMessage>JSON.parse(messageString);
			const twentyFourHoursAgo: number = (new Date).getTime() - 1000 * 60 * 60 * 24;

			if ('clientVersion' in message) {
				if (message.clientVersion == APP_VERSION) {
					wsData.isValid = true;
					let row = <DbTextRow | null>dbGetLatestText.get(path, twentyFourHoursAgo);

					if (row == null) {
						dbInsertText.run(path, '', (new Date).getTime(), 'null');
						row = <DbTextRow>dbGetLatestText.get(path, twentyFourHoursAgo);
					}

					let message = {
						version: row.id,
						text: row.text,
					};

					ws.send(JSON.stringify(message));
				} else {
					ws.send(JSON.stringify({ message: 'Your client is out of date.' }));
					ws.close();
					return;
				}
			} else {
				let release = await mutexLocks[path].acquire();
				let row = <DbTextRow | null>dbGetLatestText.get(path, twentyFourHoursAgo);

				if (row === null) {
					ws.send(JSON.stringify({ message: 'The from version does not exist.' }));
					ws.close();
					return;
				}

				if ('text' in message) {
					row.text = applyChange(row.text, message.position, 0, message.text);
				} else {
					row.text = applyChange(row.text, message.position, message.length, "");
				}

				db.prepare('UPDATE "texts" SET "text" = ? WHERE "id" = ?').run(row.text, row.id);

				release();

				sockets[path].forEach(socket => {
					if (ws.data == undefined) return;
					const wsData = <WebSocketData>ws.data;
					if (wsData.isValid == false) return;

					socket.send(JSON.stringify(message));
				});
			}
		},
		perMessageDeflate: true,
	},
});

console.log(`Listening on localhost:${server.port}`);
