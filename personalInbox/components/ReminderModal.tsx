/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getTheme, Theme } from "@utils/discord";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Forms, Modal, openModal, showToast, useState } from "@webpack/common";

import { getReminderPreset, ReminderPreset, toLocalDateTimeInput } from "../reminderLogic";
import { setEntryReminder } from "../storage";
import { InboxEntry } from "../types";

type ReminderMode = "remind" | "change" | "snooze";

interface ReminderModalOptions {
    entry: InboxEntry;
    mode: ReminderMode;
}

const PRESET_LABELS: Record<ReminderPreset, string> = {
    fifteenMinutes: "15 minutes",
    oneHour: "1 hour",
    laterToday: "Later Today",
    tomorrow: "Tomorrow",
    nextWeek: "Next Week"
};

export function openReminderModal(options: ReminderModalOptions) {
    openModal(modalProps => <ReminderModal {...options} modalProps={modalProps} />);
}

function ReminderModal({ entry, mode, modalProps }: ReminderModalOptions & { modalProps: RenderModalProps; }) {
    const now = Date.now();
    const initialTimestamp = mode === "change" && entry.remindAt !== null
        ? entry.remindAt
        : getReminderPreset(mode === "snooze" ? "fifteenMinutes" : "tomorrow", now)!;
    const [timestamp, setTimestamp] = useState(initialTimestamp);
    const [customValue, setCustomValue] = useState(toLocalDateTimeInput(initialTimestamp));
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const presets: ReminderPreset[] = mode === "snooze"
        ? ["fifteenMinutes", "oneHour", "laterToday", "tomorrow"]
        : ["laterToday", "tomorrow", "nextWeek"];

    function selectTimestamp(nextTimestamp: number) {
        setTimestamp(nextTimestamp);
        setCustomValue(toLocalDateTimeInput(nextTimestamp));
        setError("");
    }

    function selectPreset(preset: ReminderPreset) {
        const nextTimestamp = getReminderPreset(preset);
        if (nextTimestamp !== null) selectTimestamp(nextTimestamp);
    }

    function selectCustom(value: string) {
        setCustomValue(value);
        const parsed = new Date(value).getTime();
        if (!Number.isFinite(parsed)) {
            setError("Choose a valid local date and time.");
            return;
        }

        setTimestamp(parsed);
        setError(parsed <= Date.now() ? "Reminder time must be in the future." : "");
    }

    async function save() {
        if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
            setError("Reminder time must be in the future.");
            return;
        }

        setSaving(true);
        try {
            await setEntryReminder(entry.id, timestamp);
            showToast(mode === "snooze" ? "Reminder snoozed" : "Reminder saved", "success");
            modalProps.onClose();
        } catch {
            setError("Could not save this reminder. Please choose a future time and try again.");
            setSaving(false);
        }
    }

    const title = mode === "snooze" ? "Snooze Reminder" : mode === "change" ? "Change Reminder" : "Remind Me";

    return (
        <Modal
            {...modalProps}
            title={title}
            size="sm"
            actions={[{
                text: mode === "snooze" ? "Snooze" : "Save Reminder",
                variant: "primary",
                onClick: save,
                loading: saving,
                disabled: saving || !!error || timestamp <= Date.now()
            }]}
        >
            <Forms.FormTitle>Quick choices</Forms.FormTitle>
            <div className="vc-pi-reminder-presets">
                {presets.map(preset => {
                    const resolved = getReminderPreset(preset);
                    if (resolved === null) return null;
                    return (
                        <Button
                            key={preset}
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={() => selectPreset(preset)}
                            disabled={saving}
                        >
                            {PRESET_LABELS[preset]}
                        </Button>
                    );
                })}
            </div>

            <Forms.FormText className="vc-pi-reminder-help">
                Later Today is two hours ahead, rounded up to the next half hour. Tomorrow and Next Week use 9:00 AM. All times are local.
            </Forms.FormText>

            <Forms.FormTitle>Custom date & time</Forms.FormTitle>
            <input
                className="vc-pi-date-picker"
                type="datetime-local"
                value={customValue}
                min={toLocalDateTimeInput(Date.now() + 60_000)}
                onChange={event => selectCustom(event.currentTarget.value)}
                disabled={saving}
                style={{ colorScheme: getTheme() === Theme.Light ? "light" : "dark" }}
            />

            <Forms.FormText className={error ? "vc-pi-reminder-error" : "vc-pi-reminder-preview"}>
                {error || `Will remind you ${new Date(timestamp).toLocaleString()}`}
            </Forms.FormText>
        </Modal>
    );
}
