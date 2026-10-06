/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { getNextDueTimestamp } from "./reminderLogic";
import { claimDueReminders, getEntries, releaseClaimedReminders, subscribe } from "./storage";
import { InboxEntry } from "./types";

const MAX_TIMER_DELAY = 2_147_483_647;
const RETRY_DELAY = 60_000;

interface ReminderSchedulerOptions {
    notificationsEnabled(): boolean;
    previewLength(): number;
    openEntry(entry: InboxEntry): void;
    onError(): void;
}

let options: ReminderSchedulerOptions | undefined;
let running = false;
let processing = false;
let timer: number | undefined;
let unsubscribe: (() => void) | undefined;

function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
}

function truncate(text: string, maxLength: number) {
    const normalized = text.trim() || "No text content";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function showReminder(entry: InboxEntry) {
    if (!options) return;
    const location = entry.guildName ? `#${entry.channelName}` : entry.channelName;
    const previewLength = Math.max(40, Math.min(options.previewLength(), 160));

    void showNotification({
        title: "PersonalInbox Reminder",
        body: `${entry.authorName} — ${location}\n“${truncate(entry.content, previewLength)}”\nClick to open message.`,
        noPersist: true,
        onClick: () => options?.openEntry(entry)
    });
}

async function processDueReminders() {
    if (!running || processing || !options?.notificationsEnabled()) return;

    processing = true;
    clearTimer();
    const claimedAt = Date.now();
    let failed = false;

    try {
        const claimed = await claimDueReminders(claimedAt);
        if (!running || !options.notificationsEnabled()) {
            if (claimed.length)
                await releaseClaimedReminders(claimed.map(entry => entry.id), claimedAt);
            return;
        }

        claimed.forEach(showReminder);
    } catch {
        failed = true;
        options.onError();
    } finally {
        processing = false;
        if (running && options.notificationsEnabled()) {
            if (failed)
                timer = window.setTimeout(processDueReminders, RETRY_DELAY);
            else
                scheduleNextReminder();
        }
    }
}

function scheduleNextReminder() {
    if (!running || processing || !options?.notificationsEnabled()) return;
    clearTimer();

    const next = getNextDueTimestamp(getEntries());
    if (next === null) return;

    const delay = Math.min(MAX_TIMER_DELAY, Math.max(0, next - Date.now()));
    timer = window.setTimeout(processDueReminders, delay);
}

export function startReminderScheduler(schedulerOptions: ReminderSchedulerOptions) {
    stopReminderScheduler();
    options = schedulerOptions;
    running = true;
    unsubscribe = subscribe(scheduleNextReminder);
    scheduleNextReminder();
}

export function refreshReminderScheduler() {
    if (!running) return;
    clearTimer();
    if (options?.notificationsEnabled())
        void processDueReminders();
}

export function stopReminderScheduler() {
    running = false;
    clearTimer();
    unsubscribe?.();
    unsubscribe = undefined;
    options = undefined;
}
