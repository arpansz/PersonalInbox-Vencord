# PersonalInbox for Vencord

PersonalInbox saves Discord messages to a private local inbox with categories, notes, search, completion, message navigation, reminders, and snooze. It is a custom Vencord userplugin, not an official Vencord plugin.

## Windows — Easy Install

1. Download `PersonalInbox-Setup-v1.1.0.exe` from [GitHub Releases](https://github.com/arpansz/PersonalInbox-Vencord/releases).
2. Run the installer and follow its prompts.
3. Allow it to prepare a Vencord source build. It may install Git or Node.js LTS through Windows Package Manager if needed.
4. Restart Discord if requested.
5. Open Discord → Settings → Vencord → Plugins, search for `PersonalInbox`, and enable it.

The installer automates a Vencord source build because PersonalInbox is currently a custom userplugin that stock/prebuilt Vencord cannot load as a loose third-party plugin. It shows its actions, uses the official Vencord repository and installer CLI, and asks you before retrying when Discord is running. It never removes Discord data or other Vencord userplugins.

The first beta installer is unsigned, so Windows SmartScreen may show a warning. Do not disable SmartScreen. Public distribution should move to Authenticode signing as the project matures.

## Advanced / Manual Installation

Requirements from the Vencord revision tested for this release:

- Git
- Node.js 22 or later
- Corepack and pnpm 11.9.0 (the repository's `packageManager` pin)

From a clean official Vencord checkout:

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item -Recurse .\personalInbox .\src\userplugins\personalInbox
corepack pnpm build --dev
corepack pnpm inject
```

The final command downloads and runs the official Vencord Installer CLI in development-install mode. Follow its prompts. Close Discord yourself before the installation step.

The tested Vencord revision is recorded in `scripts/TESTED_VENCORD_COMMIT`. To build manually, make sure the source revision matches that pin. The plugin's V1 data is migrated in place to schema V2; reminder timestamps are stored as absolute Unix milliseconds. Nothing is exported from Discord or sent to an external reminder service.

## What it does

- Save messages from the message context menu.
- Organize items as Important, Reply Later, Read Later, or Other.
- Add private notes, search, edit, mark Done/Undo, and jump to the original message.
- Open the inbox from the channel header and see a badge for unfinished items.
- Set one local reminder per item, choose a custom date and time, or snooze.
- Review reminders in Today and Upcoming; overdue reminders are recovered at plugin startup.

Reminder delivery follows Vencord's notification settings and the operating system's notification behavior. The app must be running to deliver a due reminder; an overdue reminder is recovered next time Vencord starts.

## Build the setup program

Install Inno Setup 6 and run:

```powershell
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\installer\PersonalInbox.iss
```

If Inno Setup was installed for all users or is on `PATH`, use its corresponding `ISCC.exe` location.

The setup source, bootstrap scripts, and tested Vencord revision are included in this repository. The setup program itself is not signed in this beta.

## Uninstall

Use Windows Settings → Apps → PersonalInbox for Vencord → Uninstall. The uninstaller asks before removing PersonalInbox source from the selected Vencord checkout and rebuilding. It does not delete the managed Vencord checkout, other userplugins, Discord user data, or the PersonalInbox IndexedDB data.
