/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { INBOX_CATEGORIES, InboxCategory, InboxData, InboxEntry, SavedAttachment } from "./types";

export const INBOX_SCHEMA_VERSION = 2;
export const EMPTY_INBOX_DATA: InboxData = { version: INBOX_SCHEMA_VERSION, entries: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function readTimestamp(value: unknown, fallback: number) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    return fallback;
}

function readNullableTimestamp(value: unknown) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const timestamp = Date.parse(value);
        if (Number.isFinite(timestamp)) return timestamp;
    }
    return null;
}

function isCategory(value: unknown): value is InboxCategory {
    return typeof value === "string" && INBOX_CATEGORIES.some(category => category === value);
}

function migrateAttachment(value: unknown): SavedAttachment | null {
    if (!isRecord(value)) return null;

    const id = readString(value.id);
    const filename = readString(value.filename);
    const url = readString(value.url);
    if (!id || !filename || !url) return null;

    return {
        id,
        filename,
        url,
        contentType: typeof value.contentType === "string" ? value.contentType : undefined,
        size: typeof value.size === "number" ? value.size : 0
    };
}

function migrateEntry(value: unknown): InboxEntry | null {
    if (!isRecord(value)) return null;

    const messageId = readString(value.messageId);
    const channelId = readString(value.channelId);
    const authorId = readString(value.authorId);
    if (!messageId || !channelId || !authorId) return null;

    const now = Date.now();
    const savedAt = readTimestamp(value.savedAt, now);
    const remindAt = readNullableTimestamp(value.remindAt);

    return {
        id: readString(value.id, `${channelId}:${messageId}`),
        messageId,
        channelId,
        guildId: typeof value.guildId === "string" ? value.guildId : undefined,
        guildName: typeof value.guildName === "string" ? value.guildName : undefined,
        channelName: readString(value.channelName, "Unknown channel"),
        authorId,
        authorName: readString(value.authorName, "Unknown author"),
        content: readString(value.content),
        messageTimestamp: readTimestamp(value.messageTimestamp, savedAt),
        attachments: Array.isArray(value.attachments)
            ? value.attachments.map(migrateAttachment).filter(attachment => attachment !== null)
            : [],
        savedAt,
        updatedAt: readTimestamp(value.updatedAt, savedAt),
        category: isCategory(value.category) ? value.category : "other",
        note: readString(value.note),
        done: value.done === true,
        remindAt,
        reminderNotifiedAt: remindAt === null ? null : readNullableTimestamp(value.reminderNotifiedAt)
    };
}

/**
 * V1 and older entries are normalized into V2 without changing their identity or
 * existing content. Reminder fields deliberately default to null.
 */
export function migrateInboxData(value: unknown): InboxData {
    if (value === undefined) return EMPTY_INBOX_DATA;
    if (!isRecord(value)) throw new Error("Personal Inbox data is not a valid object.");

    const { version } = value;
    if (version !== undefined && version !== 1 && version !== INBOX_SCHEMA_VERSION)
        throw new Error(`Personal Inbox data uses unsupported schema version ${String(version)}.`);

    if (!Array.isArray(value.entries))
        throw new Error("Personal Inbox entries are not a valid array; stored data was left unchanged.");

    const entries = value.entries.map(migrateEntry);
    if (entries.some(entry => entry === null))
        throw new Error("A Personal Inbox entry is incomplete; stored data was left unchanged.");

    return {
        version: INBOX_SCHEMA_VERSION,
        entries: entries as InboxEntry[]
    };
}

export function needsInboxMigration(value: unknown) {
    if (!isRecord(value) || value.version !== INBOX_SCHEMA_VERSION || !Array.isArray(value.entries))
        return value !== undefined;

    return value.entries.some(entry =>
        !isRecord(entry)
        || !("remindAt" in entry)
        || !("reminderNotifiedAt" in entry)
    );
}
