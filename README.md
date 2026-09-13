# YouText

Extensão para Firefox que substitui páginas de vídeo do YouTube por sua transcrição. A intenção é ler mais e assistir menos.

<img width="1873" height="1014" alt="image" src="https://github.com/user-attachments/assets/d7cfb214-f338-4dcc-bfd8-1d1a2763119f" />
<img width="1873" height="1014" alt="image" src="https://github.com/user-attachments/assets/7b0ddc3f-e9db-4c6e-aa4c-62fb6f55cadc" />


## O que faz

- Na Home e nos resultados de pesquisa, exibe uma lista simples de títulos com links para `/watch?v=…`.
- Inclui uma barra para pesquisar vídeos no YouTube.
- Em `/watch?v=…`, exibe a transcrição no Firefox desktop.
- Usa a faixa padrão do painel de transcrição do YouTube.
- Exibe título, canal e texto da transcrição.
- Gera, sob demanda, um resumo em inglês com a quantidade necessária de tópicos essenciais ou um artigo em inglês usando o modelo Gemini escolhido nas configurações.
- Quando não há transcrição, tenta experimentalmente solicitar um resumo pelo botão nativo **Perguntar** do YouTube.
- Bloqueia o player e informa quando nem a transcrição nem o recurso **Perguntar** estão disponíveis.

Não há conta, telemetria ou backend. Para gerar resumos, configure uma API key Gemini própria. Shorts, playlists, lives e embeds não fazem parte do v1.

## Ativar ou desativar

Clique no ícone do YouText no menu de extensões do navegador e altere **YouText ativado**. A preferência fica salva neste perfil e vale para todas as abas do YouTube. As páginas abertas recarregam automaticamente ao alternar; desativado, o YouTube funciona normalmente. O padrão é ativado.

## Read later

A home mostra os títulos de **Read later** antes dos recomendados. A extensão usa internamente a playlist Watch later (`/playlist?list=WL`) da sessão atual do YouTube, sem enviar esses títulos ao Gemini. Se a página inicial da playlist não contiver todos os itens, um aviso indica que a exibição é parcial. É necessário estar conectado à conta desejada no YouTube.

Em páginas de vídeo, o player nativo permanece ativo atrás da interface, sempre silenciado e invisível, para que o YouTube possa registrar o progresso enquanto a transcrição é lida. O navegador pode bloquear a reprodução automática; nesse caso, clique no vídeo no YouTube se quiser iniciar a reprodução.

Ao marcar um vídeo como lido, o YouText salva esse estado localmente e o remove de **Read later** quando presente. Em visitas futuras, o botão indica **Already read**.

## Resumos com Gemini

Como fluxo alternativo de teste, vídeos sem transcrição tentam usar o **Perguntar** do próprio YouTube. A extensão abre o painel, envia um pedido de resumo e renderiza a resposta. Esse caminho depende da disponibilidade e da estrutura interna experimental do YouTube, podendo deixar de funcionar sem aviso.

Quando esse fluxo falha, abra **Ask YouTube diagnostic log** na tela e use **Copy diagnostic log**. O mesmo rastreamento aparece no console da página com o prefixo `[YouText Ask]`. O log registra etapas e elementos encontrados, sem incluir cookies ou credenciais.

O botão **Já assisti**, ao lado dos títulos, aciona o menu nativo do YouTube: **Não tenho interesse → Diga o motivo → Já assisti ao vídeo → Enviar**. Essa ação envia feedback de recomendação ao YouTube; não equivale a reproduzir o vídeo nem garante que ele nunca reapareça. Depende de o card nativo oferecer essas opções (menus em português ou inglês). Se houver falha após a primeira etapa, o YouText informa que o motivo não foi confirmado.

1. Abra as configurações da extensão no Firefox.
2. Crie uma API key no [Google AI Studio](https://aistudio.google.com/app/apikey) e salve-a nas configurações.
3. Abra um vídeo com transcrição. O resumo é gerado automaticamente, com fallback entre os modelos disponíveis. O último modelo bem-sucedido é priorizado por 24 horas; depois disso, a ordem automática é restaurada.
4. Use **Read more** no fim do resumo para gerar uma versão detalhada.

A chave fica apenas no armazenamento local do perfil Firefox. Resumos e artigos gerados também são armazenados localmente e reutilizados ao recarregar ou revisitar o vídeo, evitando novas chamadas ao Gemini. O cache mantém os 100 conteúdos mais recentes. Ela mostra os tokens usados e o contexto restante do modelo; a quota real do projeto é consultada no Google AI Studio.

## Instalar localmente

1. Abra `about:debugging#/runtime/this-firefox` no Firefox.
2. Clique em **Load Temporary Add-on**.
3. Execute `npm run package` neste diretório.
4. Selecione o arquivo `youtext.xpi` gerado.

O pacote `.xpi` é necessário ao usar navegadores Firefox instalados via Flatpak, como Zen Browser: ele preserva o acesso aos scripts da extensão.

Após alterar o código, gere novamente o pacote e carregue o `.xpi` atualizado. Depois, recarregue as abas abertas do YouTube para que usem a versão atual da extensão.

Para manter o pacote atualizado automaticamente durante o desenvolvimento, deixe este comando em execução:

```sh
npm run package:watch
```

Ele gera o pacote ao iniciar e novamente a cada alteração em um arquivo da extensão. Ainda é necessário recarregar a extensão temporária no navegador.

As gerações usam uma conexão persistente com o background. Ela permanece aberta durante novas tentativas e trocas de modelo, evitando que uma resposta longa perca o canal de comunicação. No modo **Automatic**, cada modelo é tentado uma vez; erros temporários fazem a extensão seguir imediatamente para o próximo modelo disponível.

Se aparecer **Could not establish connection. Receiving end does not exist.**, recarregue primeiro a página. Se persistir, recarregue a extensão em `about:debugging#/runtime/this-firefox` e depois a página. Consulte **Inspect** na extensão para verificar erros do background caso a conexão continue indisponível.

A instalação temporária é removida ao fechar o Firefox.

## Desenvolvimento

Requer Node.js para os testes.

```sh
npm test
```

## Limite conhecido

O YouTube não fornece uma API pública de leitura de legendas para vídeos de terceiros. A extensão abre e lê o painel nativo de transcrição da página; alterações internas do YouTube podem exigir manutenção.

## Licença

[MIT](LICENSE)
