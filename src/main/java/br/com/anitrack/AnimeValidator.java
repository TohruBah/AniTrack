package br.com.anitrack;
import java.util.Set;
public final class AnimeValidator {
 private static final Set<String> STATUSES=Set.of("Planejado","Assistindo","Pausado","Concluído");
 private AnimeValidator(){}
 public static void validate(String title,int total,int watched,String status,Integer rating){
  if(title==null||title.isBlank())throw new IllegalArgumentException("O título é obrigatório.");
  if(title.trim().length()>100)throw new IllegalArgumentException("O título deve ter no máximo 100 caracteres.");
  if(total<=0)throw new IllegalArgumentException("O total de episódios deve ser maior que zero.");
  if(watched<0||watched>total)throw new IllegalArgumentException("Episódios assistidos devem estar entre zero e o total.");
  if(status==null||!STATUSES.contains(status))throw new IllegalArgumentException("Status inválido.");
  if(rating!=null&&(rating<0||rating>10))throw new IllegalArgumentException("A avaliação deve estar entre 0 e 10.");
 }
}
