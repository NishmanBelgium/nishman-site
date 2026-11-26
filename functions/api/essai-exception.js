/* Route d'épreuve, préproduction seulement — retirée avant la production.
   Elle lève une exception hors de tout try, pour vérifier que le garde
   _middleware.js la rattrape et rend un JSON lisible au lieu d'un 500
   opaque de Cloudflare. */
export async function onRequestGet() {
  const e = new Error("exception volontaire pour éprouver le garde-fou");
  e.code = "epreuve_garde";
  throw e;
}
