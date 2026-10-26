/* ==========================================================================
   CONFIG — SEUL FICHIER À MODIFIER AU QUOTIDIEN.
   - AGENTS : les commerciaux (slug = URL des cartes QR, ne jamais changer).
   - Le script Google n'est plus joint depuis le navigateur. La page de
     devis passe par /api/devis, qui ajoute côté serveur le code
     authentifiant l'appel. N'y remettez pas l'adresse du script : elle
     serait de nouveau lisible par n'importe quel visiteur.
   ========================================================================== */

const AGENTS = {
  dilhan: { name: "Dilhan", whatsapp: "32489970087" },
  guilem: { name: "Guilem", whatsapp: "32497634122" },
  bekir: { name: "Bekir", whatsapp: "32488018585" },
};

const SHARED = {
  instagram: "https://www.instagram.com/nishmanfr_be/",
  catalog: "/produits/",
  website: "https://nishman.be",
  bio: "Distributeur officiel Nishman pour la Belgique, la France et le Luxembourg. Produits professionnels pour barbers et coiffeurs.",
};
