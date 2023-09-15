export const APP_NAME = 'MultiEdit';
export const APP_VERSION = '0.0';

export type ClientMessage = RegistrationMessage | InsertionMessageFromClient | DeletionMessageFromClient;

export interface RegistrationMessage {
	clientVersion: string;
}

export interface InsertionMessageFromClient {
	id: string;
	position: number;
	text: string;
};

export interface DeletionMessageFromClient {
	id: string;
	position: number;
	length: number;
};

export function applyChange(oldValue: string, changeStart: number, changeLength: number, changeReplacement: string): string {
	return oldValue.substring(0, changeStart) + changeReplacement + oldValue.substring(changeStart + changeLength);
}
