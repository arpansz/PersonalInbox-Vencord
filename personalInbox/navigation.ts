/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, NavigationRouter, PermissionsBits, PermissionStore, showToast } from "@webpack/common";

import { InboxEntry } from "./types";

export function jumpToInboxMessage(entry: InboxEntry, beforeNavigate?: () => void) {
    const channel = ChannelStore.getChannel(entry.channelId);
    if (!channel || !channel.isPrivate() && !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel)) {
        showToast("Unable to jump to this message. It may have been deleted or you may no longer have access.", "failure");
        return false;
    }

    const guildId = channel.isPrivate() ? "@me" : channel.guild_id ?? entry.guildId;
    if (!guildId) {
        showToast("Unable to jump to this message. It may have been deleted or you may no longer have access.", "failure");
        return false;
    }

    try {
        beforeNavigate?.();
        NavigationRouter.transitionTo(`/channels/${guildId}/${entry.channelId}/${entry.messageId}`);
        return true;
    } catch {
        showToast("Unable to jump to this message. It may have been deleted or you may no longer have access.", "failure");
        return false;
    }
}
