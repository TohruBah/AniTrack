# AniTrack — Catálogo e Gerenciador de Animes

Projeto individual de Gestão da Qualidade de Software.

**Responsável:** Alexandre Augusto dos Santos de Oliveira — análise, desenvolvimento, testes e documentação.

**Objetivo:** organizar catálogo pessoal de animes, progresso de episódios, status, favoritos e avaliações.

**Tecnologias:** Java 17, Javalin, SQLite/JDBC, Maven, JUnit 5, HTML, CSS e JavaScript.

## Requisitos
RF01 cadastro; 
RF02 listagem; 
RF03 pesquisa; 
RF04 edição; 
RF05 exclusão; 
RF06 progresso; 
RF07 status; 
RF08 favoritos; 
RF09 avaliação.
RNF01 interface web; 
RNF02 persistência SQLite; 
RNF03 validação e integridade.

## Executar
1. Instale JDK 17+ e Maven.
2. `mvn test`
3. `mvn exec:java`
4. Acesse http://localhost:7070

Banco local: `data/anitrack.db`.


## Funcionalidades adicionadas — Calendário e página de detalhes

- **Calendário de lançamentos:** alternância entre visualização semanal e mensal, consulta de episódios programados e destaque de títulos identificados na coleção do usuário.
- **Página de detalhes do anime:** acessível a partir dos cards do catálogo, da Central de descobertas e dos eventos do calendário; apresenta sinopse, capa/banner, gêneros, formato, temporada, episódios, estúdio e obras relacionadas.
- **Fonte de dados da programação e das informações dos animes:** API GraphQL do AniList (`https://graphql.anilist.co`). A programação depende dos dados publicados pelo serviço e pode sofrer alterações.
- **Fuso horário:** o calendário oferece horário local do navegador ou Tempo Universal Coordenado (UTC).

Os dados externos são carregados no navegador. A ausência de informações na API não impede o acesso ao restante do catálogo; a interface apresenta uma mensagem de erro e permite tentar novamente ao reabrir a tela.
