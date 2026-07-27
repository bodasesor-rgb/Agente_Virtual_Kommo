/** Filtra pares basura que contaminarían few-shot (ubicación sin sentido, ok/gracias). */
export function isUsefulLearningPair(pair: {
  user_message?: string;
  suggested_response?: string;
}): boolean {
  const user = pair.user_message?.trim() ?? "";
  const resp = pair.suggested_response?.trim() ?? "";
  if (!user || !resp) return false;
  if (user.length < 4 || resp.length < 12) return false;
  if (/^(ok|okay|va|dale|gracias|hola|s[ií]|no|perfecto)[\s!.]*$/i.test(user)) return false;
  if (/^(ok|okay|va|dale|gracias|hola|s[ií]|perfecto)[\s!.]*$/i.test(resp)) return false;
  // Respuestas que "anotan" basura como ubicación del evento.
  if (
    /\b(anoto|guardo|ubicaci[oó]n|direcci[oó]n|lugar)\b/i.test(resp) &&
    /\b(es\s+muy\s+importante|en\s+la\s+noche|show\s+en\s+vivo|en\s+vivo|color\s+blanco|en\s+realidad|donde\s+estan)\b/i.test(
      resp
    )
  ) {
    return false;
  }
  return true;
}
