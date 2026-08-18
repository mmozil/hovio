/**
 * Content script — roda DENTRO da página da reunião.
 *
 * Aqui vai morar a pílula do Discoo: em vez de flutuar por cima como o app do
 * Windows, ela nasce dentro do Meet, junto do lugar onde a conversa está.
 *
 * Por enquanto faz duas coisas pequenas e necessárias:
 *  - deixa o id da extensão legível no DOM (é o que permite testar de fora, sem
 *    depender de clicar no ícone do navegador, que nenhuma automação alcança);
 *  - acorda o service worker. 🚨 No MV3 ele é sob demanda: fica desligado até
 *    receber a primeira mensagem, e sem isto nem existe pra ser encontrado.
 */
document.documentElement.dataset.discoo = chrome.runtime.id;

chrome.runtime.sendMessage({ para: 'sw', tipo: 'estado' }).catch(() => {});
