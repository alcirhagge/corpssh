; Mata o processo CorpSSH antes de instalar/desinstalar
; Evita o dialog "Nao e possivel fechar o CorpSSH"

!macro customInit
  nsExec::Exec 'taskkill /F /IM "CorpSSH.exe" /T'
  Sleep 500
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "CorpSSH.exe" /T'
  Sleep 500
!macroend
