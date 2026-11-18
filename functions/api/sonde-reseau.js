/* --------------------------------------------------------------------------
   SONDE RÉSEAU — temporaire, branche de préversion uniquement.

   Une seule question, posée le 18 novembre 2026 : depuis Cloudflare, quels
   services fiscaux sont joignables ? On sait que le VIES ne l'était pas ;
   on ignore si l'API du registre des entreprises l'est.

   Elle ne lit rien, n'écrit rien, n'expose aucun secret. À supprimer une
   fois la réponse connue.
   -------------------------------------------------------------------------- */

const CIBLES = [
  { nom: "registre des entreprises (data.gouv)",
    url: "https://recherche-entreprises.api.gouv.fr/search?q=943141192&per_page=1",
    attendu: "FR0F943141192" },
  { nom: "VIES REST (Commission européenne)",
    url: "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/FR/vat/0F943141192",
    attendu: "B.M. BARBER" },
];

export async function onRequestGet() {
  const resultats = [];
  for (const c of CIBLES) {
    const t0 = Date.now();
    try {
      const r = await fetch(c.url, {
        headers: { Accept: "application/json", "User-Agent": "nishman.be" },
        signal: AbortSignal.timeout(12000),
      });
      const texte = await r.text();
      resultats.push({
        cible: c.nom,
        joignable: true,
        statut: r.status,
        ms: Date.now() - t0,
        contenu_attendu: texte.includes(c.attendu),
        extrait: texte.slice(0, 120),
      });
    } catch (e) {
      resultats.push({
        cible: c.nom,
        joignable: false,
        ms: Date.now() - t0,
        erreur: String((e && e.message) || e).slice(0, 160),
      });
    }
  }
  return new Response(JSON.stringify({ ok: true, date: new Date().toISOString(), resultats }, null, 2),
    { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
