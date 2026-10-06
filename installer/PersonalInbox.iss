; PersonalInbox Windows installer. Review all of this source before compiling.
#define ProductName "PersonalInbox for Vencord"
#define ProductVersion "1.1.0"
#define ProductPublisher "PersonalInbox contributors"

[Setup]
AppId={{9A7E1F98-AB64-4E2E-9DF8-25E847BFF150}
AppName={#ProductName}
AppVersion={#ProductVersion}
AppPublisher={#ProductPublisher}
DefaultDirName={localappdata}\PersonalInbox
DefaultGroupName={#ProductName}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
Uninstallable=yes
OutputDir=..\dist
OutputBaseFilename=PersonalInbox-Setup-v1.1.0
Compression=lzma2
SolidCompression=yes
CloseApplications=no
DisableProgramGroupPage=yes
DisableDirPage=yes
UninstallDisplayName={#ProductName} {#ProductVersion}
VersionInfoVersion=1.1.0.0
VersionInfoProductName={#ProductName}
VersionInfoProductVersion={#ProductVersion}
VersionInfoCompany={#ProductPublisher}
VersionInfoDescription=Builds and installs the PersonalInbox Vencord userplugin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
Name: "{app}\payload"
Name: "{app}\scripts"

[Files]
Source: "..\personalInbox\*"; DestDir: "{app}\payload\personalInbox"; Flags: recursesubdirs ignoreversion
Source: "..\scripts\*.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\TESTED_VENCORD_COMMIT"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\VERSION"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -File ""{app}\scripts\bootstrap.ps1"" -Mode Install"; WorkingDir: "{app}"; Description: "Prepare Vencord and install PersonalInbox"; StatusMsg: "Preparing Vencord and installing PersonalInbox..."; Flags: postinstall waituntilterminated skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -File ""{app}\scripts\uninstall.ps1"""; WorkingDir: "{app}"; RunOnceId: "PersonalInboxRemoveFromVencord"; Flags: waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}\payload"
