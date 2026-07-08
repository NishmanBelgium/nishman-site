/* ==========================================================================
   CONFIGURATION — c'est le seul fichier à modifier au quotidien.
   Ne touchez jamais aux QR codes : ils pointent vers /dilhan, /guilem, /bekir
   et continueront de fonctionner tant que ces clés existent ci-dessous.
   ========================================================================== */

/**
 * Un commercial par clé. La clé DOIT correspondre exactement au chemin
 * imprimé sur le QR code (ex : nishman.be/dilhan -> clé "dilhan").
 *
 * whatsapp : numéro complet, SANS le "+", SANS espaces.
 *            Exemple Belgique : 32 470 12 34 56 -> "32470123456"
 */
const AGENTS = {
  dilhan: {
    name: "Dilhan",
    whatsapp: "32489970087",
  },
  guilem: {
    name: "Guilem",
    whatsapp: "32497634122",
  },
  bekir: {
    name: "Bekir",
    whatsapp: "32488018585",
  },
};

/**
 * Contenu partagé par les trois pages.
 * Modifier ici met à jour les 3 cartes en même temps, sans jamais
 * toucher aux QR codes imprimés.
 */
const SHARED = {
  brand: "NISHMAN",
  tagline: "Creative Men Design",
  eyebrow: "NBD Distribution Belgium",

  // Texte de présentation générique affiché sous le nom du commercial.
  bio: "Conseiller(ère) commercial(e) dédié(e), à votre écoute pour vos commandes de soins barbier et coiffure professionnels Nishman.",

  // Compte Instagram pas encore créé : laissez "" et le bouton reste
  // masqué automatiquement. Dès que le compte existe, collez son lien
  // ici (ex. "https://instagram.com/nishman.be") et le bouton apparaît
  // aussitôt sur les 3 cartes, sans toucher au reste.
  instagram: "",

  // Catalogue commun. Remplacez le fichier catalogue.pdf par une nouvelle
  // version (même nom !) pour le mettre à jour sans rien changer d'autre.
  catalog: "/catalogue.pdf",

  // Site web de la société (mettre "" pour masquer le bouton).
  website: "https://nishman.be",

  // Message pré-rempli envoyé sur WhatsApp (le nom du commercial est
  // inséré automatiquement).
  whatsappMessage: (name) =>
    `Bonjour ${name}, je vous contacte suite à votre carte de visite Nishman.`,
};
