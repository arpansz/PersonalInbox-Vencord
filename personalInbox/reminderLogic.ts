/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { InboxEntry } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type ReminderPreset = "laterToday" | "tomorrow" | "nextWeek" | "fifteenMinutes" | "oneHour";

export function startOfLocalDay(timestamp: number) {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function startOfNextLocalDay(timestamp: number) {
    const date = new Date(timestamp);
    date.setHours(24, 0, 0, 0);
    return date.getTime();
}

export function getReminderPreset(preset: ReminderPreset, now = Date.now()) {
    const date = new Date(now);

    switch (preset) {
        case "fifteenMinutes":
            return now + 15 * MINUTE;
        case "oneHour":
            return now + HOUR;
        case "laterToday": {
            const rounded = new Date(now + 2 * HOUR);
            rounded.setSeconds(0, 0);
            rounded.setMinutes(Math.ceil(rounded.getMinutes() / 30) * 30);
            return rounded.getTime() < startOfNextLocalDay(now) ? rounded.getTime() : null;
        }
        case "tomorrow":
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
            return date.getTime();
        case "nextWeek":
            date.setDate(date.getDate() + 7);
            date.setHours(9, 0, 0, 0);
            return date.getTime();
    }
}

export function isReminderEligible(entry: InboxEntry) {
    return !entry.done && entry.remindAt !== null && entry.reminderNotifiedAt === null;
}

export function getNextDueTimestamp(entries: InboxEntry[]) {
    let next: number | null = null;
    for (const entry of entries) {
        if (!isReminderEligible(entry)) continue;
        if (next === null || entry.remindAt! < next) next = entry.remindAt;
    }
    return next;
}

export function setReminderState(entry: InboxEntry, remindAt: number | null, now = Date.now()): InboxEntry {
    return {
        ...entry,
        remindAt,
        reminderNotifiedAt: null,
        updatedAt: now
    };
}

export function setDoneState(entry: InboxEntry, done: boolean, now = Date.now()): InboxEntry {
    const passedWhileDone = !done
        && entry.done
        && entry.remindAt !== null
        && entry.remindAt <= now
        && entry.reminderNotifiedAt === null;

    return {
        ...entry,
        done,
        reminderNotifiedAt: passedWhileDone ? now : entry.reminderNotifiedAt,
        updatedAt: now
    };
}

export function isTodayReminder(entry: InboxEntry, now = Date.now()) {
    return !entry.done && entry.remindAt !== null && entry.remindAt < startOfNextLocalDay(now);
}

export function isUpcomingReminder(entry: InboxEntry, now = Date.now()) {
    return !entry.done && entry.remindAt !== null && entry.remindAt >= startOfNextLocalDay(now);
}

export function toLocalDateTimeInput(timestamp: number) {
    const date = new Date(timestamp);
    const offset = date.getTimezoneOffset() * MINUTE;
    return new Date(timestamp - offset).toISOString().slice(0, 16);
}
