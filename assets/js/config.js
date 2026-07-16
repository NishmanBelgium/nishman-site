/* ==========================================================================
   CONFIG — SEUL FICHIER À MODIFIER AU QUOTIDIEN.
   Changements de cette version :
   - "catalog" pointe vers le catalogue en ligne (/produits/) au lieu du PDF ;
   - "instagram" est renseigné : le bouton apparaît sur les cartes QR.
   Les slugs (dilhan, guilem, bekir) ne doivent JAMAIS changer : ce sont eux
   qui sont gravés dans les QR codes imprimés.
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
