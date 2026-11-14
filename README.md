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
