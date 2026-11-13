package br.com.anitrack;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class AnimeValidatorTest {
 @Test void acceptsValidAnime(){assertDoesNotThrow(()->AnimeValidator.validate("Uma Musume",13,0,"Planejado",10));}
 @Test void rejectsBlankTitle(){assertThrows(IllegalArgumentException.class,()->AnimeValidator.validate(" ",12,0,"Planejado",null));}
 @Test void acceptsTitleLength100(){assertDoesNotThrow(()->AnimeValidator.validate("A".repeat(100),1,0,"Planejado",null));}
 @Test void rejectsTitleLength101(){assertThrows(IllegalArgumentException.class,()->AnimeValidator.validate("A".repeat(101),1,0,"Planejado",null));}
 @Test void rejectsWatchedAboveTotal(){assertThrows(IllegalArgumentException.class,()->AnimeValidator.validate("Anime",12,13,"Assistindo",null));}
 @Test void acceptsRatingBoundaries(){assertDoesNotThrow(()->AnimeValidator.validate("Anime",12,0,"Planejado",0));assertDoesNotThrow(()->AnimeValidator.validate("Anime",12,0,"Planejado",10));}
 @Test void rejectsRatingOutsideRange(){assertThrows(IllegalArgumentException.class,()->AnimeValidator.validate("Anime",12,0,"Planejado",11));assertThrows(IllegalArgumentException.class,()->AnimeValidator.validate("Anime",12,0,"Planejado",-1));}
}
