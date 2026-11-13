package br.com.anitrack;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
public final class Database {
 private static final String URL="jdbc:sqlite:data/anitrack.db";
 private Database(){}
 public static Connection connect() throws Exception {
  Files.createDirectories(Path.of("data"));
  Connection c=DriverManager.getConnection(URL);
  try(Statement s=c.createStatement()){
   s.executeUpdate("CREATE TABLE IF NOT EXISTS anime (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),total_episodes INTEGER NOT NULL CHECK(total_episodes>0),watched_episodes INTEGER NOT NULL CHECK(watched_episodes BETWEEN 0 AND total_episodes),status TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,rating INTEGER CHECK(rating BETWEEN 0 AND 10))");
  }
  return c;
 }
}
