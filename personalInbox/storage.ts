/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { setDoneState, setReminderState } from "./reminderLogic";
import { EMPTY_INBOX_DATA, migrateInboxData, needsInboxMigration } from "./schema";
import { InboxData, InboxEntry } from "./types";

const STORAGE_KEY = "PersonalInbox_data";

let data: InboxData = EMPTY_INBOX_DATA;
let loaded = false;
let loadPromise: Promise<void> | undefined;
let mutationQueue = Promise.resolve();

const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) listener();
}

export async function loadInbox() {
    if (loaded) return;

    loadPromise ??= DataStore.get<unknown>(STORAGE_KEY).then(async stored => {
        const migrated = migrateInboxData(stored);
        if (needsInboxMigration(stored)) await DataStore.set(STORAGE_KEY, migrated);
        data = migrated;
        loaded = true;
        emitChange();
    }).catch(error => {
        loadPromise = undefined;
        throw error;
    });

    await loadPromise;
}

export function getEntries() {
    return data.entries;
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export async function getEntryForMessage(channelId: string, messageId: string) {
    await loadInbox();
    return data.entries.find(entry => entry.channelId === channelId && entry.messageId === messageId);
}

function mutate<T>(updater: (entries: InboxEntry[]) => { entries: InboxEntry[]; result: T; }) {
    const operation = mutationQueue.then(async () => {
        await loadInbox();

        const { entries, result } = updater(data.entries);
        const nextData: InboxData = { version: 2, entries };
        await DataStore.set(STORAGE_KEY, nextData);
        data = nextData;
        emitChange();
        return result;
    });

    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
}

export function upsertEntry(entry: InboxEntry) {
    return mutate(entries => {
        const index = entries.findIndex(current =>
            current.channelId === entry.channelId && current.messageId === entry.messageId
        );

        if (index === -1) {
            return { entries: [entry, ...entries], result: "created" as const };
        }

        const current = entries[index];
        const updated: InboxEntry = {
            ...entry,
            id: current.id,
            savedAt: current.savedAt,
            done: current.done,
            remindAt: current.remindAt,
            reminderNotifiedAt: current.reminderNotifiedAt
        };
        const nextEntries = entries.slice();
        nextEntries[index] = updated;
        return { entries: nextEntries, result: "updated" as const };
    });
}

export function setEntryDone(id: string, done: boolean) {
    return mutate(entries => ({
        entries: entries.map(entry => entry.id === id
            ? setDoneState(entry, done)
            : entry),
        result: undefined
    }));
}

export function setEntryReminder(id: string, remindAt: number | null) {
    if (remindAt !== null && (!Number.isFinite(remindAt) || remindAt <= Date.now()))
        return Promise.reject(new Error("Reminder must be in the future."));

    return mutate(entries => ({
        entries: entries.map(entry => entry.id === id
            ? setReminderState(entry, remindAt)
            : entry),
        result: undefined
    }));
}

export function claimDueReminders(now = Date.now()) {
    return mutate(entries => {
        const claimed: InboxEntry[] = [];
        const nextEntries = entries.map(entry => {
            if (entry.done || entry.remindAt === null || entry.remindAt > now || entry.reminderNotifiedAt !== null)
                return entry;

            const updated = { ...entry, reminderNotifiedAt: now, updatedAt: now };
            claimed.push(updated);
            return updated;
        });

        return { entries: nextEntries, result: claimed };
    });
}

export function releaseClaimedReminders(ids: string[], claimedAt: number) {
    const idSet = new Set(ids);
    return mutate(entries => ({
        entries: entries.map(entry => idSet.has(entry.id) && entry.reminderNotifiedAt === claimedAt
            ? { ...entry, reminderNotifiedAt: null }
            : entry),
        result: undefined
    }));
}

export function deleteEntry(id: string) {
    return mutate(entries => ({
        entries: entries.filter(entry => entry.id !== id),
        result: undefined
    }));
}
