/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { Button, ChannelStore, GuildStore, Menu, showToast } from "@webpack/common";

import { InboxHeaderButton } from "./components/InboxHeaderButton";
import { openInboxModal } from "./components/InboxModal";
import { openSaveModal } from "./components/SaveModal";
import { jumpToInboxMessage } from "./navigation";
import { refreshReminderScheduler, startReminderScheduler, stopReminderScheduler } from "./reminders";
import { getEntryForMessage, loadInbox } from "./storage";
import { InboxEntrySource } from "./types";

const settings = definePluginSettings({
    openInbox: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={openPersonalInbox}>
                Open Personal Inbox
            </Button>
        )
    },
    defaultCategory: {
        type: OptionType.SELECT,
        description: "Category selected when saving a new message",
        options: [
            { label: "Important", value: "important" },
            { label: "Reply Later", value: "replyLater", default: true },
            { label: "Read Later", value: "readLater" },
            { label: "Other", value: "other" }
        ] as const
    },
    showSaveConfirmation: {
        type: OptionType.BOOLEAN,
        description: "Show a toast after saving or updating an entry",
        default: true
    },
    includeDoneByDefault: {
        type: OptionType.BOOLEAN,
        description: "Include completed entries in the All filter",
        default: false
    },
    enableReminderNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show PersonalInbox reminders using Vencord's notification settings and the operating system when enabled there",
        default: true,
        onChange: refreshReminderScheduler
    },
    previewLength: {
        type: OptionType.SLIDER,
        description: "Maximum number of message characters shown in each inbox preview",
        markers: [100, 250, 500, 1000, 2000],
        default: 500,
        stickToMarkers: false
    }
});

let schedulerErrorShown = false;

function openPersonalInbox() {
    void openInboxModal({
        includeDone: settings.store.includeDoneByDefault,
        previewLength: settings.store.previewLength,
        showConfirmation: settings.store.showSaveConfirmation
    });
}

function getChannelName(message: Message) {
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel) return "Unknown channel";
    if (channel.name) return channel.name;

    const recipients = channel.rawRecipients
        ?.map(recipient => recipient.global_name ?? recipient.display_name ?? recipient.username)
        .filter(Boolean);

    return recipients?.join(", ") || "Direct Message";
}

function captureMessage(message: Message): InboxEntrySource {
    const channel = ChannelStore.getChannel(message.channel_id);
    const guildId = channel?.guild_id || undefined;

    return {
        messageId: message.id,
        channelId: message.channel_id,
        guildId,
        guildName: guildId ? GuildStore.getGuild(guildId)?.name : undefined,
        channelName: getChannelName(message),
        authorId: message.author.id,
        authorName: message.nick ?? message.author.globalName ?? message.author.username,
        content: message.content,
        messageTimestamp: message.timestamp.getTime(),
        attachments: message.attachments.map(attachment => ({
            id: attachment.id,
            filename: attachment.filename,
            url: attachment.url,
            contentType: attachment.content_type,
            size: attachment.size
        }))
    };
}

async function saveMessage(message: Message) {
    try {
        const source = captureMessage(message);
        const existing = await getEntryForMessage(source.channelId, source.messageId);

        openSaveModal({
            source,
            existing,
            defaultCategory: settings.store.defaultCategory ?? "replyLater",
            showConfirmation: settings.store.showSaveConfirmation
        });
    } catch {
        showToast("Could not open Personal Inbox", "failure");
    }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { message?: Message; }) => {
    const { message } = props;
    if (!message?.id || !message.channel_id || !message.author?.id) return;

    const group = findGroupChildrenByChildId(["reply", "copy-text"], children) ?? children;
    group.push(
        <Menu.MenuItem
            id="vc-personal-inbox-save"
            label="Save to Personal Inbox"
            action={() => void saveMessage(message)}
        />
    );
};

export default definePlugin({
    name: "PersonalInbox",
    description: "Save Discord messages to a private, local inbox for later",
    tags: ["Chat", "Organisation", "Utility"],
    authors: [{ name: "Arpan", id: 0n }],
    settings,
    contextMenus: {
        message: messageContextMenuPatch
    },

    // Same titlebar module as VencordToolbox. Add a sibling after native Inbox,
    // leaving both the native control and Toolbox's Fragment wrapper intact.
    patches: [{
        find: '?"BACK_FORWARD_NAVIGATION":',
        replacement: {
            match: /(\.\.\."RECENTS"===\i\?\i:\{\}\}\)),/,
            replace: "$1,$self.renderHeaderButton(),"
        }
    }],

    renderHeaderButton() {
        return (
            <ErrorBoundary key="vc-personal-inbox" noop>
                <InboxHeaderButton onOpen={openPersonalInbox} />
            </ErrorBoundary>
        );
    },

    async start() {
        try {
            await loadInbox();
            schedulerErrorShown = false;
            startReminderScheduler({
                notificationsEnabled: () => settings.store.enableReminderNotifications,
                previewLength: () => settings.store.previewLength,
                openEntry: entry => { jumpToInboxMessage(entry); },
                onError: () => {
                    if (schedulerErrorShown) return;
                    schedulerErrorShown = true;
                    showToast("PersonalInbox could not update reminder data and will retry", "failure");
                }
            });
        } catch {
            showToast("Could not load Personal Inbox data", "failure");
        }
    },

    stop() {
        stopReminderScheduler();
    }
});
