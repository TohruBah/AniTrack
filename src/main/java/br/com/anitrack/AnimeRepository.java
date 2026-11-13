
package br.com.anitrack;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class AnimeRepository {

    public Anime create(String title, int total, int watched, String status) throws Exception {
        AnimeValidator.validate(title, total, watched, status, null);

        try (Connection c = Database.connect();
             PreparedStatement p = c.prepareStatement(
                 "INSERT INTO anime(title,total_episodes,watched_episodes,status) VALUES(?,?,?,?)",
                 Statement.RETURN_GENERATED_KEYS)) {

            p.setString(1, title.trim());
            p.setInt(2, total);
            p.setInt(3, watched);
            p.setString(4, status);
            p.executeUpdate();

            try (ResultSet r = p.getGeneratedKeys()) {
                return new Anime(
                    r.next() ? r.getInt(1) : 0,
                    title.trim(), total, watched, status, false, null
                );
            }
        }
    }

    public List<Anime> findAll() throws Exception {
        return findAll("");
    }

    public List<Anime> findAll(String search) throws Exception {
        List<Anime> out = new ArrayList<>();

        String sql = "SELECT * FROM anime WHERE LOWER(title) LIKE LOWER(?) ORDER BY title";

        try (Connection c = Database.connect();
             PreparedStatement p = c.prepareStatement(sql)) {

            p.setString(1, "%" + (search == null ? "" : search.trim()) + "%");

            try (ResultSet r = p.executeQuery()) {
                while (r.next()) {
                    int rating = r.getInt("rating");
                    Integer value = r.wasNull() ? null : rating;

                    out.add(new Anime(
                        r.getInt("id"),
                        r.getString("title"),
                        r.getInt("total_episodes"),
                        r.getInt("watched_episodes"),
                        r.getString("status"),
                        r.getInt("favorite") == 1,
                        value
                    ));
                }
            }
        }

        return out;
    }

    public boolean update(int id, String title, int total,
                          int watched, String status) throws Exception {

        AnimeValidator.validate(title, total, watched, status, null);

        String sql = """
            UPDATE anime
            SET title = ?, total_episodes = ?,
                watched_episodes = ?, status = ?
            WHERE id = ?
            """;

        try (Connection c = Database.connect();
             PreparedStatement p = c.prepareStatement(sql)) {

            p.setString(1, title.trim());
            p.setInt(2, total);
            p.setInt(3, watched);
            p.setString(4, status);
            p.setInt(5, id);

            return p.executeUpdate() > 0;
        }
    }


    public boolean updateProgress(int id, int watched) throws Exception {

        try (Connection c = Database.connect()) {

            int total;

            try (PreparedStatement p = c.prepareStatement(
                    "SELECT total_episodes FROM anime WHERE id = ?")) {

                p.setInt(1, id);

                try (ResultSet r = p.executeQuery()) {
                    if (!r.next()) {
                        return false;
                    }

                    total = r.getInt("total_episodes");
                }
            }

            if (watched < 0 || watched > total) {
                throw new IllegalArgumentException(
                    "Os episódios assistidos devem estar entre 0 e " + total + "."
                );
            }

            try (PreparedStatement p = c.prepareStatement(
                    "UPDATE anime SET watched_episodes = ? WHERE id = ?")) {

                p.setInt(1, watched);
                p.setInt(2, id);

                return p.executeUpdate() > 0;
            }
        }
    }


public boolean updateFavorite(int id, boolean favorite) throws Exception {
    String sql = "UPDATE anime SET favorite = ? WHERE id = ?";

    try (Connection c = Database.connect();
         PreparedStatement p = c.prepareStatement(sql)) {
        p.setInt(1, favorite ? 1 : 0);
        p.setInt(2, id);
        return p.executeUpdate() > 0;
    }
}

public boolean updateRating(int id, Integer rating) throws Exception {
    if (rating != null && (rating < 0 || rating > 10)) {
        throw new IllegalArgumentException(
            "A avaliação deve estar entre 0 e 10."
        );
    }

    String sql = "UPDATE anime SET rating = ? WHERE id = ?";

    try (Connection c = Database.connect();
         PreparedStatement p = c.prepareStatement(sql)) {
        if (rating == null) {
            p.setNull(1, java.sql.Types.INTEGER);
        } else {
            p.setInt(1, rating);
        }

        p.setInt(2, id);
        return p.executeUpdate() > 0;
    }
}


    public boolean delete(int id) throws Exception {
        try (Connection c = Database.connect();
             PreparedStatement p = c.prepareStatement(
                 "DELETE FROM anime WHERE id = ?")) {

            p.setInt(1, id);
            return p.executeUpdate() > 0;
        }
    }
}
