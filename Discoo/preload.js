const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tier', {
  // pílula
  estado: (gravando) => ipcRenderer.send('estado', gravando),
  tamanho: (largura, altura) => ipcRenderer.send('tamanho', largura, altura),
  salvar: (buffer, ext) => ipcRenderer.invoke('salvar', buffer, ext),
  abrirArquivo: () => ipcRenderer.invoke('abrir-arquivo'),
  pedaco: (buffer) => ipcRenderer.send('pedaco', buffer),
  fecharArquivo: () => ipcRenderer.invoke('fechar-arquivo'),
  abrirPasta: (arquivo) => ipcRenderer.send('abrir-pasta', arquivo),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  fechar: () => ipcRenderer.send('fechar'),
  aoAlternar: (fn) => ipcRenderer.on('alternar-gravacao', fn),
  aoSobre: (fn) => ipcRenderer.on('sobre', (_e, dentro) => fn(dentro)),
  // conta + envio
  config: () => ipcRenderer.invoke('config'),
  login: (email, senha) => ipcRenderer.invoke('login', email, senha),
  sairConta: () => ipcRenderer.invoke('sair-conta'),
  enviar: (caminho) => ipcRenderer.invoke('enviar', caminho),
  // ata: rota publica do Discoo, sem login (o `enviar` acima e o QA de Ligacoes)
  transcrever: (caminho, opcoes) => ipcRenderer.invoke('transcrever', caminho, opcoes),
  aoTranscricao: (fn) => ipcRenderer.on('transcricao', (_e, texto) => fn(texto)),
  prefs: (novas) => ipcRenderer.invoke('prefs', novas),
  inicioWindows: (ligar) => ipcRenderer.invoke('inicio-windows', ligar),
});
