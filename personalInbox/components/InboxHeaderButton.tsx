/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import { ChannelType } from "@vencord/discord-types/enums";
import { findByPropsLazy, findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, React, SelectedChannelStore, useStateFromStores } from "@webpack/common";

import { getEntries, subscribe } from "../storage";

// Use the same native button as VencordToolbox for spacing, focus and tooltip.
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');
const LayerStore = findStoreLazy("LayerStore");
const ModalState = findByPropsLazy("useHasModalOpen");

function subscribeToRoute(listener: () => void) {
    FluxDispatcher.subscribe("ROUTE_CHANGED", listener);
    return () => FluxDispatcher.unsubscribe("ROUTE_CHANGED", listener);
}

function getPathname() {
    return location.pathname;
}

function getPendingCount() {
    return getEntries().filter(entry => !entry.done).length;
}

export function InboxHeaderButton({ onOpen }: { onOpen: () => void; }) {
    const { enabled } = useSettings(["plugins.PersonalInbox.enabled"]).plugins.PersonalInbox;
    const pathname = React.useSyncExternalStore(subscribeToRoute, getPathname);
    const count = React.useSyncExternalStore(subscribe, getPendingCount);
    const channel = useStateFromStores([SelectedChannelStore, ChannelStore], () => {
        const id = SelectedChannelStore.getCurrentlySelectedChannelId();
        return id ? ChannelStore.getChannel(id) : undefined;
    });
    const hasLayers = useStateFromStores([LayerStore], () => LayerStore.hasLayers());
    const settingsOpen: boolean = ModalState.useHasModalOpen("USER_SETTINGS_MODAL_MODAL_KEY");

    // Selected-channel state can outlive a route. Require a real conversation
    // route too. Settings now uses a modal; also exclude full-screen layers.
    const routeChannelId = /^\/channels\/(?:@me|\d+)\/(\d+)(?:\/|$)/.exec(pathname)?.[1];
    if (!enabled || hasLayers || settingsOpen || !channel || channel.id !== routeChannelId) return null;
    if (channel.type !== ChannelType.GUILD_TEXT && channel.type !== ChannelType.GUILD_ANNOUNCEMENT
        && !channel.isPrivate() && !channel.isThread()) return null;

    return (
        <HeaderBarIcon
            tooltip="Personal Inbox"
            aria-label={`Personal Inbox${count ? ` (${count} unfinished items)` : ""}`}
            onClick={onOpen}
            icon={() => (
                <span className="vc-pi-header-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M5 4h14l3 10v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5L5 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M2 14h6l2 3h4l2-3h6M8 8h8M9 11h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    {count > 0 && <span className="vc-pi-header-badge">{count > 9 ? "9+" : count}</span>}
                </span>
            )}
        />
    );
}
