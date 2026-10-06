/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, Select, showToast, TextArea, useState } from "@webpack/common";

import { upsertEntry } from "../storage";
import { CATEGORY_LABELS, INBOX_CATEGORIES, InboxCategory, InboxEntry, InboxEntrySource } from "../types";

const CATEGORY_OPTIONS = INBOX_CATEGORIES.map(value => ({
    label: CATEGORY_LABELS[value],
    value
}));

interface SaveModalOptions {
    source: InboxEntrySource;
    existing?: InboxEntry;
    defaultCategory: InboxCategory;
    showConfirmation: boolean;
}

export function openSaveModal(options: SaveModalOptions) {
    openModal(modalProps => <SaveModal {...options} modalProps={modalProps} />);
}

function SaveModal({ source, existing, defaultCategory, showConfirmation, modalProps }: SaveModalOptions & { modalProps: RenderModalProps; }) {
    const [category, setCategory] = useState<InboxCategory>(existing?.category ?? defaultCategory);
    const [note, setNote] = useState(existing?.note ?? "");
    const [saving, setSaving] = useState(false);

    const preview = source.content.trim() || (source.attachments.length ? `[${source.attachments.length} attachment${source.attachments.length === 1 ? "" : "s"}]` : "No text content");

    async function save() {
        setSaving(true);

        try {
            const now = Date.now();
            const result = await upsertEntry({
                ...source,
                id: existing?.id ?? `${source.channelId}:${source.messageId}`,
                savedAt: existing?.savedAt ?? now,
                updatedAt: now,
                category,
                note: note.trim(),
                done: existing?.done ?? false,
                remindAt: existing?.remindAt ?? null,
                reminderNotifiedAt: existing?.reminderNotifiedAt ?? null
            });

            if (showConfirmation)
                showToast(result === "created" ? "Saved to Personal Inbox" : "Personal Inbox entry updated", "success");

            modalProps.onClose();
        } catch {
            showToast("Could not save the Personal Inbox entry", "failure");
            setSaving(false);
        }
    }

    return (
        <Modal
            {...modalProps}
            title={existing ? "Edit Personal Inbox Entry" : "Save to Personal Inbox"}
            size="sm"
            actions={[
                {
                    text: existing ? "Save Changes" : "Save",
                    variant: "primary",
                    onClick: save,
                    loading: saving,
                    disabled: saving
                }
            ]}
        >
            <Forms.FormTitle>Message</Forms.FormTitle>
            <Forms.FormText className="vc-pi-save-preview">{preview}</Forms.FormText>

            <Forms.FormTitle>Category</Forms.FormTitle>
            <Select
                options={CATEGORY_OPTIONS}
                select={setCategory}
                isSelected={value => value === category}
                serialize={String}
                closeOnSelect
            />

            <Forms.FormTitle className="vc-pi-note-title">Private note (optional)</Forms.FormTitle>
            <TextArea
                value={note}
                onChange={setNote}
                placeholder="Why are you saving this?"
                maxLength={2000}
                rows={4}
                disabled={saving}
            />
        </Modal>
    );
}
