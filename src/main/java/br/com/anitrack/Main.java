
package br.com.anitrack;

import io.javalin.Javalin;

public class Main {

    public static void main(String[] args) {

        AnimeRepository repo = new AnimeRepository();

        Javalin app = Javalin.create(
            config -> config.staticFiles.add("/public")
        ).start(7070);

        // Tratamento de erros de validação
        app.exception(IllegalArgumentException.class, (e, ctx) -> {
            ctx.status(400).result(e.getMessage());
        });

        // Listagem e pesquisa
        app.get("/api/animes", ctx -> {
            String search = ctx.queryParam("search");
            ctx.json(repo.findAll(search));
        });

        // Cadastro
        app.post("/api/animes", ctx -> {
            var body = ctx.bodyAsClass(CreateAnimeRequest.class);

            var anime = repo.create(
                body.title(),
                body.totalEpisodes(),
                body.watchedEpisodes(),
                body.status()
            );

            ctx.status(201).json(anime);
        });

        // Edição
        app.put("/api/animes/{id}", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            var body = ctx.bodyAsClass(CreateAnimeRequest.class);

            boolean updated = repo.update(
                id,
                body.title(),
                body.totalEpisodes(),
                body.watchedEpisodes(),
                body.status()
            );

            if (!updated) {
                ctx.status(404);
            } else {
                ctx.status(204);
            }
        });

        // Atualização do progresso
        app.patch("/api/animes/{id}/progress", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            var body = ctx.bodyAsClass(ProgressRequest.class);

            boolean updated = repo.updateProgress(
                id,
                body.watchedEpisodes()
            );

            if (!updated) {
                ctx.status(404);
            } else {
                ctx.status(204);
            }
        });

                // Atualização de favorito
        app.patch("/api/animes/{id}/favorite", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            var body = ctx.bodyAsClass(FavoriteRequest.class);

            boolean updated = repo.updateFavorite(
                id,
                body.favorite()
            );

            if (!updated) {
                ctx.status(404);
            } else {
                ctx.status(204);
            }
        });

        // Atualização de avaliação
        app.patch("/api/animes/{id}/rating", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            var body = ctx.bodyAsClass(RatingRequest.class);

            boolean updated = repo.updateRating(
                id,
                body.rating()
            );

            if (!updated) {
                ctx.status(404);
            } else {
                ctx.status(204);
            }
        });

        // Exclusão
        app.delete("/api/animes/{id}", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));

            if (!repo.delete(id)) {
                ctx.status(404);
            } else {
                ctx.status(204);
            }
        });
    }

    public record CreateAnimeRequest(
        String title,
        int totalEpisodes,
        int watchedEpisodes,
        String status
    ) {}

    public record ProgressRequest(
        int watchedEpisodes
    ) {}

        public record FavoriteRequest(
        boolean favorite
    ) {}

    public record RatingRequest(
        Integer rating
    ) {}
}


