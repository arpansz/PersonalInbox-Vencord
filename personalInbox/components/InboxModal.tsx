/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Button, ConfirmModal, ContextMenuApi, Forms, Menu, Modal, openModal, ScrollerThin, showToast, TabBar, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import { jumpToInboxMessage } from "../navigation";
import { isTodayReminder, isUpcomingReminder, startOfLocalDay, startOfNextLocalDay } from "../reminderLogic";
import { deleteEntry, getEntries, loadInbox, setEntryDone, setEntryReminder, subscribe } from "../storage";
import { CATEGORY_LABELS, InboxEntry, InboxFilter, InboxView } from "../types";
import { openReminderModal } from "./ReminderModal";
import { openSaveModal } from "./SaveModal";

interface InboxModalOptions {
    includeDone: boolean;
    previewLength: number;
    showConfirmation: boolean;
}

const VIEWS: { id: InboxView; label: string; }[] = [
    { id: "inbox", label: "Inbox" },
    { id: "today", label: "Today" },
    { id: "upcoming", label: "Upcoming" },
    { id: "done", label: "Done" }
];

const FILTERS: { id: InboxFilter; label: string; }[] = [
    { id: "all", label: "All" },
    { id: "important", label: "Important" },
    { id: "replyLater", label: "Reply Later" },
    { id: "readLater", label: "Read Later" },
    { id: "other", label: "Other" }
];

let inboxOpen = false;

export async function openInboxModal(options: InboxModalOptions) {
    // Reserve before loading storage so rapid clicks cannot stack modals.
    if (inboxOpen) return;
    inboxOpen = true;
    try {
        await loadInbox();
        openModal(modalProps => <InboxModal {...options} modalProps={modalProps} />, {
            modalKey: "vc-personal-inbox",
            onCloseCallback: () => { inboxOpen = false; }
        });
    } catch {
        inboxOpen = false;
        showToast("Could not load Personal Inbox data", "failure");
    }
}

function InboxModal({ includeDone, previewLength, showConfirmation, modalProps }: InboxModalOptions & { modalProps: RenderModalProps; }) {
    const [entries, setEntries] = useState(getEntries());
    const [view, setView] = useState<InboxView>("inbox");
    const [filter, setFilter] = useState<InboxFilter>("all");
    const [query, setQuery] = useState("");
    const [now, setNow] = useState(Date.now());

    useEffect(() => subscribe(() => {
        setEntries(getEntries());
        setNow(Date.now());
    }), []);

    // Keeps relative due labels and local-day views correct across midnight and wake-from-sleep.
    useEffect(() => {
        let timer: number;
        const tick = () => {
            setNow(Date.now());
            timer = window.setTimeout(tick, 60_000 - Date.now() % 60_000 + 50);
        };
        timer = window.setTimeout(tick, 60_000 - Date.now() % 60_000 + 50);
        return () => window.clearTimeout(timer);
    }, []);

    const visibleEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();

        const visible = entries.filter(entry => {
            switch (view) {
                case "inbox":
                    if (entry.done && !includeDone) return false;
                    if (filter !== "all" && entry.category !== filter) return false;
                    break;
                case "today":
                    if (!isTodayReminder(entry, now)) return false;
                    break;
                case "upcoming":
                    if (!isUpcomingReminder(entry, now)) return false;
                    break;
                case "done":
                    if (!entry.done) return false;
                    break;
            }

            if (!normalizedQuery) return true;
            return [entry.content, entry.authorName, entry.note, entry.channelName, entry.guildName ?? ""]
                .some(value => value.toLocaleLowerCase().includes(normalizedQuery));
        });

        if (view === "today" || view === "upcoming")
            visible.sort((a, b) => a.remindAt! - b.remindAt!);

        return visible;
    }, [entries, filter, includeDone, now, query, view]);

    return (
        <Modal {...modalProps} title={`Personal Inbox (${entries.length})`} size="lg">
            <Forms.FormText className="vc-pi-local-notice">
                Saved entries, private notes, and reminders stay in Vencord's local storage on this device.
            </Forms.FormText>

            <TextInput
                value={query}
                onChange={setQuery}
                placeholder="Search messages, authors, channels, and notes"
                aria-label="Search Personal Inbox"
            />

            <TabBar
                type="top"
                look="brand"
                className="vc-pi-tabs"
                selectedItem={view}
                onItemSelect={setView}
            >
                {VIEWS.map(item => (
                    <TabBar.Item key={item.id} id={item.id}>
                        {item.label}
                    </TabBar.Item>
                ))}
            </TabBar>

            {view === "inbox" && (
                <TabBar
                    type="top"
                    look="brand"
                    className="vc-pi-category-tabs"
                    selectedItem={filter}
                    onItemSelect={setFilter}
                >
                    {FILTERS.map(item => (
                        <TabBar.Item key={item.id} id={item.id}>
                            {item.label}
                        </TabBar.Item>
                    ))}
                </TabBar>
            )}

            <ScrollerThin className="vc-pi-list">
                {visibleEntries.length
                    ? visibleEntries.map(entry => (
                        <InboxItem
                            key={entry.id}
                            entry={entry}
                            now={now}
                            previewLength={previewLength}
                            showConfirmation={showConfirmation}
                            closeInbox={modalProps.onClose}
                        />
                    ))
                    : <div className="vc-pi-empty">No saved messages match this view.</div>
                }
            </ScrollerThin>
        </Modal>
    );
}

function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString();
}

function formatReminder(timestamp: number, now: number) {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const today = startOfLocalDay(now);
    const tomorrow = startOfNextLocalDay(now);
    const dayAfterTomorrow = startOfNextLocalDay(tomorrow);

    if (timestamp >= today && timestamp < tomorrow) return `Today at ${time}`;
    if (timestamp >= tomorrow && timestamp < dayAfterTomorrow) return `Tomorrow at ${time}`;
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatOverdue(timestamp: number, now: number) {
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (minutes < 1) return "Due now";
    if (minutes < 60) return `Due ${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Overdue by ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Overdue by ${days}d`;
}

function truncate(text: string, maxLength: number) {
    const normalized = text.trim() || "No text content";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function confirmDelete(entry: InboxEntry) {
    openModal(modalProps => (
        <ConfirmModal
            {...modalProps}
            title="Delete Personal Inbox Entry"
            subtitle="This removes the saved entry, its private note, and its reminder from local storage."
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={async () => {
                try {
                    await deleteEntry(entry.id);
                    showToast("Personal Inbox entry deleted", "success");
                } catch {
                    showToast("Could not delete the Personal Inbox entry", "failure");
                }
            }}
        />
    ));
}

function InboxItem({ entry, now, previewLength, showConfirmation, closeInbox }: { entry: InboxEntry; now: number; previewLength: number; showConfirmation: boolean; closeInbox: () => void; }) {
    const location = entry.guildName ? `${entry.guildName} • #${entry.channelName}` : entry.channelName;
    const overdue = !entry.done && entry.remindAt !== null && entry.remindAt <= now;

    async function toggleDone() {
        try {
            await setEntryDone(entry.id, !entry.done);
        } catch {
            showToast("Could not update the Personal Inbox entry", "failure");
        }
    }

    async function clearReminder() {
        try {
            await setEntryReminder(entry.id, null);
            showToast("Reminder cleared", "success");
        } catch {
            showToast("Could not clear the reminder", "failure");
        }
    }

    function openReminderActions(event: React.MouseEvent) {
        ContextMenuApi.openContextMenu(event, () => (
            <Menu.Menu navId={`vc-pi-reminder-${entry.id}`} onClose={ContextMenuApi.closeContextMenu}>
                <Menu.MenuItem
                    id="vc-pi-snooze"
                    label="Snooze"
                    action={() => openReminderModal({ entry, mode: "snooze" })}
                />
                <Menu.MenuItem
                    id="vc-pi-change-reminder"
                    label="Change Reminder"
                    action={() => openReminderModal({ entry, mode: "change" })}
                />
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="vc-pi-clear-reminder"
                    label="Clear Reminder"
                    color="danger"
                    action={() => void clearReminder()}
                />
            </Menu.Menu>
        ));
    }

    return (
        <article className={`vc-pi-item${entry.done ? " vc-pi-item-done" : ""}${overdue ? " vc-pi-item-overdue" : ""}`}>
            <div className="vc-pi-item-heading">
                <strong>{entry.authorName}</strong>
                <span className={`vc-pi-category vc-pi-category-${entry.category}`}>{CATEGORY_LABELS[entry.category]}</span>
                {entry.done && <span className="vc-pi-done-label">Done</span>}
            </div>

            <div className="vc-pi-location">{location} • {formatDate(entry.messageTimestamp)}</div>
            <div className="vc-pi-content">{truncate(entry.content, previewLength)}</div>

            {entry.attachments.length > 0 && (
                <div className="vc-pi-attachments">
                    {entry.attachments.length} attachment{entry.attachments.length === 1 ? "" : "s"}
                </div>
            )}

            {entry.note && (
                <div className="vc-pi-note">
                    <strong>Note:</strong> {entry.note}
                </div>
            )}

            {entry.remindAt !== null && (
                <div className={`vc-pi-reminder-time${overdue ? " vc-pi-reminder-overdue" : ""}`}>
                    Reminder: {formatReminder(entry.remindAt, now)}{overdue ? ` • ${formatOverdue(entry.remindAt, now)}` : ""}
                </div>
            )}

            <div className="vc-pi-saved-time">Saved {formatDate(entry.savedAt)}</div>

            <div className="vc-pi-actions">
                <Button size={Button.Sizes.SMALL} onClick={() => jumpToInboxMessage(entry, closeInbox)}>Jump to Message</Button>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => openSaveModal({
                    source: entry,
                    existing: entry,
                    defaultCategory: entry.category,
                    showConfirmation
                })}>Edit</Button>
                {entry.remindAt === null
                    ? <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => openReminderModal({ entry, mode: "remind" })}>Remind Me</Button>
                    : <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={openReminderActions}>Reminder Actions</Button>
                }
                <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={toggleDone}>
                    {entry.done ? "Undo Done" : "Mark Done"}
                </Button>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => confirmDelete(entry)}>Delete</Button>
            </div>
        </article>
    );
}
