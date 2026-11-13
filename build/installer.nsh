!include x64.nsh

; Лаунчер ставится для всех пользователей в Program Files (x86)\Lustre. Сборка 64-битная, поэтому
; electron-builder по умолчанию выбрал бы Program Files: задаём папку через ту же запись реестра,
; из которой он берёт путь прежней установки. Пишем только если лаунчер ещё не ставился для всех:
; иначе обновление перенесло бы его из папки, выбранной пользователем.
!macro preInit
  !ifndef BUILD_UNINSTALLER
    ${If} ${RunningX64}
      SetRegView 64
    ${EndIf}
    ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == ""
      WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES32\${APP_FILENAME}"
    ${EndIf}
    SetRegView default
  !endif
!macroend

; Как у Steam: папка лаунчера открыта на изменение пользователям (S-1-5-32-545 — «Пользователи»
; на любом языке Windows). Права администратора нужны только для первой установки, дальше лаунчер
; обновляет себя сам (electron/selfUpdate.cjs). Цена — файлы лаунчера может изменить любая программа.
!macro customInstall
  nsExec::Exec 'icacls "$INSTDIR" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0
!macroend

; Встроенный qBittorrent лежит в resources\vendor: пока он запущен, его файлы заняты
; и установщик не сможет их заменить. Имя процесса своё, клиент пользователя не затрагивается.
!macro customInit
  nsExec::Exec 'taskkill /F /IM lustre-torrent.exe'
  Pop $0
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM lustre-torrent.exe'
  Pop $0
!macroend
