' Abre o Discoo sem janela de console.
' Atalho enquanto não há .exe empacotado (electron-builder vem depois).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
' ELECTRON_RUN_AS_NODE quebra o Electron (faz require("electron") virar string)
sh.Environment("PROCESS").Remove("ELECTRON_RUN_AS_NODE")
' 🚨 3º argumento = 1 (SW_SHOWNORMAL), NUNCA 0 (SW_HIDE). O electron.exe é GUI e
' não abre console nenhum — o 0 aqui não escondia console, escondia A JANELA DO APP:
' o Windows repassa esse estado pra primeira janela pelo STARTUPINFO e o Electron
' obedece calado (isVisible() responde true, a tela fica vazia). Achado em 17/08.
sh.Run """" & pasta & "\node_modules\electron\dist\electron.exe"" """ & pasta & """", 1, False
