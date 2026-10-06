/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNextDueTimestamp, isReminderEligible, isTodayReminder, isUpcomingReminder, setDoneState, setReminderState, startOfNextLocalDay } from "./reminderLogic";
import { migrateInboxData, needsInboxMigration } from "./schema";
import { InboxEntry } from "./types";

const NOW = new Date(2026, 9, 6, 12, 0, 0, 0).getTime();

function entry(overrides: Partial<InboxEntry> = {}): InboxEntry {
    return {
        id: "channel:message",
        messageId: "message",
        channelId: "channel",
        channelName: "development",
        authorId: "author",
        authorName: "Alice",
        content: "Check the API update",
        messageTimestamp: NOW - 1_000,
        attachments: [],
        savedAt: NOW - 1_000,
        updatedAt: NOW - 1_000,
        category: "replyLater",
        note: "Keep this private",
        done: false,
        remindAt: null,
        reminderNotifiedAt: null,
        ...overrides
    };
}

describe("PersonalInbox schema migration", () => {
    it("migrates V1 entries in place to V2 reminder defaults", () => {
        const source = entry();
        const v1Entry: Record<string, unknown> = { ...source };
        delete v1Entry.remindAt;
        delete v1Entry.reminderNotifiedAt;
        const migrated = migrateInboxData({ version: 1, entries: [v1Entry] });

        assert.equal(migrated.version, 2);
        assert.equal(migrated.entries[0].id, source.id);
        assert.equal(migrated.entries[0].note, source.note);
        assert.equal(migrated.entries[0].category, source.category);
        assert.equal(migrated.entries[0].done, source.done);
        assert.equal(migrated.entries[0].remindAt, null);
        assert.equal(migrated.entries[0].reminderNotifiedAt, null);
        assert.equal(needsInboxMigration({ version: 1, entries: [v1Entry] }), true);
        assert.deepEqual(migrateInboxData(migrated), migrated);
        assert.equal(needsInboxMigration(migrated), false);
    });

    it("refuses to overwrite malformed stored inbox data", () => {
        assert.throws(() => migrateInboxData({ version: 1, entries: "not-an-array" }), /left unchanged/);
        assert.throws(() => migrateInboxData({ version: 1, entries: [{ id: "incomplete" }] }), /left unchanged/);
    });
});

describe("PersonalInbox reminder state", () => {
    it("recognizes future and overdue reminders as eligible", () => {
        assert.equal(isReminderEligible(entry({ remindAt: NOW + 1_000 })), true);
        assert.equal(isReminderEligible(entry({ remindAt: NOW - 1_000 })), true);
    });

    it("does not re-notify an already-notified reminder", () => {
        assert.equal(isReminderEligible(entry({ remindAt: NOW - 1_000, reminderNotifiedAt: NOW })), false);
    });

    it("snoozing resets notification state", () => {
        const snoozed = setReminderState(entry({ remindAt: NOW - 1_000, reminderNotifiedAt: NOW }), NOW + 15 * 60_000, NOW);
        assert.equal(snoozed.remindAt, NOW + 15 * 60_000);
        assert.equal(snoozed.reminderNotifiedAt, null);
    });

    it("Done suppresses reminders and Undo keeps future reminders active", () => {
        const done = setDoneState(entry({ remindAt: NOW + 60_000 }), true, NOW);
        assert.equal(isReminderEligible(done), false);
        assert.equal(isReminderEligible(setDoneState(done, false, NOW + 1_000)), true);
    });

    it("Undo records a reminder that passed while Done as handled", () => {
        const done = entry({ done: true, remindAt: NOW - 1_000 });
        const undone = setDoneState(done, false, NOW);
        assert.equal(undone.reminderNotifiedAt, NOW);
        assert.equal(isReminderEligible(undone), false);
    });

    it("clearing a reminder removes it from scheduling", () => {
        const cleared = setReminderState(entry({ remindAt: NOW + 1_000 }), null, NOW);
        assert.equal(cleared.remindAt, null);
        assert.equal(getNextDueTimestamp([cleared]), null);
    });

    it("selects the nearest eligible due time", () => {
        const entries = [
            entry({ id: "later", remindAt: NOW + 20_000 }),
            entry({ id: "nearest", remindAt: NOW + 10_000 }),
            entry({ id: "done", done: true, remindAt: NOW + 1_000 })
        ];
        assert.equal(getNextDueTimestamp(entries), NOW + 10_000);
    });

    it("removing an entry removes its scheduled reminder", () => {
        const deletedId = "nearest";
        const entries = [
            entry({ id: deletedId, remindAt: NOW + 10_000 }),
            entry({ id: "remaining", remindAt: NOW + 20_000 })
        ].filter(item => item.id !== deletedId);
        assert.equal(getNextDueTimestamp(entries), NOW + 20_000);
    });
});

describe("PersonalInbox local-day classification", () => {
    it("places overdue and later-today reminders in Today", () => {
        assert.equal(isTodayReminder(entry({ remindAt: NOW - 24 * 60 * 60_000 }), NOW), true);
        assert.equal(isTodayReminder(entry({ remindAt: new Date(2026, 9, 6, 23, 59).getTime() }), NOW), true);
    });

    it("places reminders at the next local day boundary in Upcoming", () => {
        const boundary = startOfNextLocalDay(NOW);
        assert.equal(isTodayReminder(entry({ remindAt: boundary }), NOW), false);
        assert.equal(isUpcomingReminder(entry({ remindAt: boundary }), NOW), true);
    });
});
