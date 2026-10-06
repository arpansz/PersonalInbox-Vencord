# Security

PersonalInbox stores saved message data, notes, and reminders in Vencord's local IndexedDB-backed DataStore. The plugin does not send inbox content to a server and does not contain telemetry.

The Windows setup program installs readable PowerShell scripts and plugin source, then clones or uses an official Vencord source checkout, installs its declared dependencies, builds it, and invokes the official Vencord installer CLI. Review `installer/PersonalInbox.iss` and `scripts/` before running the setup program.

The first beta installer is unsigned. Do not bypass Windows SmartScreen to run it. Report suspected security issues privately to the repository maintainer rather than posting credentials, tokens, or private Discord content in an issue.
