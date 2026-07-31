/* ==========================================================================
   CONFIG — SEUL FICHIER À MODIFIER AU QUOTIDIEN.
   - AGENTS : les commerciaux (slug = URL des cartes QR, ne jamais changer).
   - SHARED.orderLog : URL du registre Google Sheets (voir REGISTRE-GUIDE.txt).
     Laisser vide ("") tant que le registre n'est pas configuré.
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
  // Collez ici l'URL /exec de votre script Google (entre les guillemets) :
  orderLog: "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec",
};
