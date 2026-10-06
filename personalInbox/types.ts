/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const INBOX_CATEGORIES = ["important", "replyLater", "readLater", "other"] as const;

export type InboxCategory = typeof INBOX_CATEGORIES[number];
export type InboxFilter = "all" | InboxCategory;
export type InboxView = "inbox" | "today" | "upcoming" | "done";

export const CATEGORY_LABELS: Record<InboxCategory, string> = {
    important: "Important",
    replyLater: "Reply Later",
    readLater: "Read Later",
    other: "Other"
};

export interface SavedAttachment {
    id: string;
    filename: string;
    url: string;
    contentType?: string;
    size: number;
}

export interface InboxEntrySource {
    messageId: string;
    channelId: string;
    guildId?: string;
    guildName?: string;
    channelName: string;
    authorId: string;
    authorName: string;
    content: string;
    messageTimestamp: number;
    attachments: SavedAttachment[];
}

export interface InboxEntry extends InboxEntrySource {
    id: string;
    savedAt: number;
    updatedAt: number;
    category: InboxCategory;
    note: string;
    done: boolean;
    /** Absolute Unix timestamp in milliseconds, interpreted in the user's local timezone for display. */
    remindAt: number | null;
    /** The time this exact reminder occurrence was claimed for notification. */
    reminderNotifiedAt: number | null;
}

export interface InboxData {
    version: 2;
    entries: InboxEntry[];
}
