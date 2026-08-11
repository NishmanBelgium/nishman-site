/* ==========================================================================
   CONDITIONS GÉNÉRALES DE VENTE — page /cgv/
   Traduites dans les 5 langues du site. Seule la version française fait foi
   (clause de prévalence, article 17).
   ========================================================================== */

(function () {
  "use strict";

  const LANGS = ["fr", "en", "nl", "de", "tr"];
  const saved = localStorage.getItem("nishman-lang");
  const LANG = LANGS.includes(saved) ? saved : "fr";

  const UI = {
    fr: { back: "Retour au catalogue", eyebrow: "Document légal", title: "Conditions générales de vente",
          sub: "Réseau de distribution sélective — clients professionnels · Version du 7 août 2026",
          dl: "Télécharger le PDF" },
    en: { back: "Back to catalogue", eyebrow: "Legal document", title: "General Terms and Conditions of Sale",
          sub: "Selective distribution network — professional customers · Version of 7 August 2026",
          dl: "Download the PDF" },
    nl: { back: "Terug naar catalogus", eyebrow: "Juridisch document", title: "Algemene verkoopvoorwaarden",
          sub: "Selectief distributienetwerk — professionele klanten · Versie van 7 augustus 2026",
          dl: "PDF downloaden" },
    de: { back: "Zurück zum Katalog", eyebrow: "Rechtsdokument", title: "Allgemeine Geschäftsbedingungen",
          sub: "Selektives Vertriebsnetz — Fachkunden · Fassung vom 7. August 2026",
          dl: "PDF herunterladen" },
    tr: { back: "Kataloğa dön", eyebrow: "Hukuki belge", title: "Genel Satış Koşulları",
          sub: "Seçici dağıtım ağı — profesyonel müşteriler · 7 Ağustos 2026 sürümü",
          dl: "PDF indir" },
  };

  // Chaque article : titre + liste de paragraphes. Un élément de type
  // tableau représente une liste à puces.
  const CGV = {};

  CGV.fr = [
    ["1. Champ d'application et acceptation", [
      "Les présentes conditions générales régissent l'ensemble des ventes conclues par NBD Distribution SRL, dont le siège est établi Rue de la Poire d'Or 26, 7033 Cuesmes (Belgique), inscrite à la Banque-Carrefour des Entreprises sous le numéro BE 0817.750.283, ci-après « le Vendeur ».",
      "Le Vendeur est le distributeur officiel et exclusif des produits de la marque NISHMAN pour la Belgique, la France et le Grand-Duché de Luxembourg.",
      "Elles s'appliquent exclusivement aux clients agissant dans le cadre de leur activité professionnelle — salons de coiffure, barbershops et instituts — ci-après « le Client ». Le Vendeur ne contracte pas avec des consommateurs au sens du livre VI du Code de droit économique.",
      "Toute commande implique l'acceptation sans réserve des présentes conditions, qui prévalent sur toutes conditions d'achat du Client, sauf accord écrit et préalable du Vendeur.",
    ]],
    ["2. Réseau de distribution sélective", [
      "Les produits distribués sont des produits cosmétiques professionnels dont la qualité, l'image et le positionnement justifient une distribution sélective. Le Vendeur organise à cette fin un réseau de revendeurs agréés.",
      "L'accès au réseau est ouvert à tout candidat satisfaisant aux critères objectifs suivants, appliqués de manière non discriminatoire :",
      ["exercer à titre principal une activité professionnelle de coiffure, de barberie ou d'esthétique, dûment déclarée ;",
       "disposer d'un numéro d'identification à la TVA valide et vérifiable ;",
       "exploiter un point de vente physique ouvert à la clientèle, adapté à la présentation de produits cosmétiques professionnels ;",
       "disposer du personnel qualifié permettant le conseil à la clientèle sur l'usage des produits ;",
       "réaliser une première commande d'un montant minimum de cent (100) euros hors taxes."],
      "Tout candidat remplissant ces critères est agréé. Le Client s'engage à informer le Vendeur de toute modification affectant le respect de ces critères en cours de relation.",
    ]],
    ["3. Revente des produits", [
      "Le Client est autorisé à revendre les produits à sa clientèle finale, exclusivement depuis son point de vente physique agréé, dans le cadre de son activité professionnelle.",
      "Aux fins de préserver la qualité, l'image de marque et le conseil attaché aux produits, sont interdits :",
      ["la revente à des revendeurs non agréés par le Vendeur, en Belgique comme à l'étranger ;",
       "la revente sur des places de marché en ligne, quelles qu'elles soient, ainsi que sur tout site de vente en ligne généraliste ou de discount ;",
       "la revente à des grossistes, centrales d'achat, magasins de déstockage ou circuits parallèles ;",
       "le déconditionnement, le reconditionnement, la modification ou l'altération des emballages, étiquettes et mentions légales."],
      "Le Client conserve la faculté de présenter les produits sur son propre site internet professionnel et ses réseaux sociaux, dans le respect de l'image de la marque et sous réserve de l'article 8.",
      "Le manquement à ces obligations autorise le Vendeur à suspendre les livraisons et à résilier la relation commerciale, sans préjudice de tout dommage.",
    ]],
    ["4. Politique tarifaire", [
      "Les prix sont exprimés en euros, hors taxe sur la valeur ajoutée. Les prix applicables sont ceux en vigueur au jour de la confirmation de la commande.",
      "Le Vendeur peut communiquer au Client des prix de revente conseillés. Ces prix sont donnés à titre purement indicatif et ne présentent aucun caractère contraignant. Le Client détermine librement ses prix de revente à la clientèle finale, sans que le Vendeur puisse en subordonner la livraison, les remises ou la poursuite de la relation commerciale.",
      "Les tarifs professionnels communiqués au Client sont confidentiels. Le Client s'interdit de les divulguer à des tiers, notamment à des revendeurs concurrents.",
      "Des remises commerciales peuvent être accordées en fonction du volume commandé, de l'ancienneté de la relation ou de conditions particulières négociées. Toute remise est mentionnée sur la facture et ne constitue pas un droit pour les commandes ultérieures.",
    ]],
    ["5. Commandes", [
      "Les devis et offres de prix émis par le Vendeur, notamment via le site nishman.be, ont une valeur indicative et sont valables trente (30) jours, sous réserve de disponibilité des produits.",
      "La vente n'est parfaite qu'après confirmation écrite de la commande par le Vendeur. Le Vendeur se réserve le droit de refuser toute commande en cas de rupture de stock, d'incident de paiement antérieur, ou lorsque le Client ne satisfait plus aux critères d'agrément définis à l'article 2.",
      "Toute modification ou annulation de commande par le Client requiert l'accord écrit du Vendeur.",
    ]],
    ["6. Paiement", [
      "Sauf convention écrite contraire, les factures sont payables à la réception, sans escompte.",
      "Toute facture impayée à son échéance donne lieu de plein droit et sans mise en demeure préalable :",
      ["à un intérêt de retard au taux prévu par la loi du 2 août 2002 relative au retard de paiement dans les transactions commerciales ;",
       "à une indemnité forfaitaire de recouvrement de quarante (40) euros, sans préjudice du droit du Vendeur de réclamer une indemnisation complémentaire."],
      "Le non-paiement d'une seule facture à son échéance rend immédiatement exigible le solde de toutes les autres factures, même non échues, et autorise le Vendeur à suspendre toute livraison en cours.",
      "Le Client ne peut opérer aucune compensation ni retenue sans l'accord écrit du Vendeur.",
    ]],
    ["7. Réserve de propriété", [
      "Les marchandises livrées demeurent la propriété exclusive du Vendeur jusqu'au paiement intégral du prix en principal, intérêts et frais.",
      "Jusqu'à complet paiement, le Client s'interdit de donner les marchandises en gage ou de les céder en propriété à titre de garantie. En cas de revente, la créance du Client sur son propre acheteur est cédée de plein droit au Vendeur à concurrence du montant restant dû.",
      "Le Client s'engage à informer immédiatement le Vendeur de toute saisie ou mesure conservatoire portant sur les marchandises non entièrement payées, ainsi que de toute procédure d'insolvabilité le concernant.",
      "Nonobstant la réserve de propriété, les risques de perte ou de détérioration des marchandises sont transférés au Client dès la livraison.",
    ]],
    ["8. Marques et propriété intellectuelle", [
      "Les marques, dénominations, logos, visuels et documentations commerciales relatifs aux produits demeurent la propriété exclusive de leurs titulaires. Aucune disposition des présentes n'emporte cession ou licence de droits de propriété intellectuelle au profit du Client.",
      "Le Client est autorisé à faire état de sa qualité de revendeur des produits et à en assurer la promotion aux seules fins de leur revente. Toute utilisation des marques et logos dans une communication commerciale, une enseigne, un support publicitaire ou une campagne en ligne est subordonnée à l'accord écrit et préalable du Vendeur.",
      "Le Client s'interdit d'enregistrer, à titre de marque, de nom commercial ou de nom de domaine, tout signe reproduisant ou imitant les marques distribuées.",
    ]],
    ["9. Livraison", [
      "Sauf convention contraire, la livraison intervient dans un délai de cinq (5) jours ouvrables à compter de la réception du paiement, sous réserve de disponibilité des produits.",
      "Les frais de livraison sont offerts en Belgique, en France et au Grand-Duché de Luxembourg, sauf conditions particulières convenues entre les parties, notamment pour les envois express, les destinations éloignées ou les commandes de faible valeur.",
      "Les délais de livraison sont donnés à titre indicatif. Un retard ne peut donner lieu à l'annulation de la commande, au refus de la marchandise, à une indemnité ou à des dommages et intérêts, sauf faute lourde du Vendeur. Le Vendeur se réserve la faculté de procéder à des livraisons partielles.",
    ]],
    ["10. Réception, réclamations et retours", [
      "Le Client est tenu de vérifier l'état et la conformité des marchandises dès leur réception.",
      "Toute réclamation relative à un manquant, une erreur de référence ou un dommage apparent doit être notifiée par écrit à contact@nishman.be dans les quarante-huit (48) heures suivant la réception, accompagnée de photographies et de la référence du document de livraison. Passé ce délai, les marchandises sont réputées acceptées sans réserve.",
      "Les vices cachés doivent être dénoncés par écrit dans les quinze (15) jours de leur découverte.",
      "Les retours de marchandises sont acceptés dans un délai de quatorze (14) jours à compter de la livraison, aux conditions cumulatives suivantes :",
      ["accord écrit et préalable du Vendeur ;",
       "produits dans leur emballage d'origine, intact, non ouvert et non descellé ;",
       "produits en parfait état de revente, non étiquetés et non marqués par le Client."],
      "Aucun retour n'est accepté pour les produits ouverts, entamés ou dont l'emballage est détérioré, pour des raisons d'hygiène et de sécurité des produits cosmétiques. Les frais de retour sont à charge du Client, sauf erreur imputable au Vendeur.",
    ]],
    ["11. Garantie, conservation et conformité réglementaire", [
      "Le Vendeur garantit la conformité des produits aux spécifications du fabricant et au règlement (CE) n° 1223/2009 relatif aux produits cosmétiques.",
      "Il appartient au Client de stocker les produits dans des conditions appropriées — à l'abri de la chaleur, de l'humidité et de la lumière directe — de respecter les dates de durabilité minimale, et d'assurer la rotation de ses stocks. Aucune garantie n'est due pour les altérations résultant de conditions de conservation inadéquates.",
      "Le Client s'engage à ne pas commercialiser de produits dont la date de durabilité minimale est dépassée et à retirer immédiatement de la vente tout produit faisant l'objet d'un rappel.",
      "La responsabilité du Vendeur est limitée au remplacement des produits reconnus défectueux ou au remboursement de leur prix d'achat, à l'exclusion de tout dommage indirect, perte d'exploitation ou perte de clientèle.",
    ]],
    ["12. Durée, suspension et résiliation", [
      "La relation commerciale est conclue pour une durée indéterminée. Chaque partie peut y mettre fin moyennant un préavis écrit d'un (1) mois, sans indemnité.",
      "Le Vendeur peut suspendre les livraisons ou résilier la relation avec effet immédiat, sans préavis ni indemnité, en cas de non-paiement, de manquement aux articles 2, 3 ou 8, ou de procédure d'insolvabilité affectant le Client.",
      "La cessation de la relation n'affecte pas les commandes en cours ni les sommes dues.",
    ]],
    ["13. Protection des données", [
      "Les données à caractère personnel communiquées par le Client sont traitées par le Vendeur aux seules fins de la gestion commerciale, de l'exécution des commandes, de la facturation et du suivi de la relation d'affaires, conformément au Règlement (UE) 2016/679.",
      "Ces données sont conservées pendant la durée de la relation commerciale, augmentée des délais légaux de conservation comptable. Le Client dispose d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition, qu'il peut exercer à l'adresse contact@nishman.be.",
    ]],
    ["14. Force majeure", [
      "Le Vendeur n'est pas responsable de l'inexécution ou du retard d'exécution de ses obligations résultant d'un cas de force majeure, notamment en cas de rupture d'approvisionnement du fabricant, de grève, de blocage des transports, d'incendie, de catastrophe naturelle, de mesure administrative ou d'épidémie.",
    ]],
    ["15. Nullité partielle et intégralité", [
      "Si une clause des présentes venait à être déclarée nulle ou inapplicable, les autres clauses conserveraient leur plein effet. La clause concernée serait remplacée par une disposition valable dont l'effet économique serait le plus proche possible.",
      "Les présentes conditions, ainsi que les documents auxquels elles renvoient, constituent l'intégralité de l'accord entre les parties.",
    ]],
    ["16. Droit applicable et juridiction compétente", [
      "Les présentes conditions générales sont soumises au droit belge.",
      "Tout différend relatif à leur formation, leur interprétation ou leur exécution relève de la compétence exclusive des cours et tribunaux de l'arrondissement judiciaire du Hainaut, division de Mons.",
    ]],
    ["17. Langue", [
      "Les présentes conditions générales sont rédigées en français. Toute traduction est fournie à titre informatif uniquement. En cas de divergence entre la version française et une traduction, la version française prévaut.",
    ]],
  ];

  CGV.en = [
    ["1. Scope and acceptance", [
      "These general terms and conditions govern all sales concluded by NBD Distribution SRL, whose registered office is at Rue de la Poire d'Or 26, 7033 Cuesmes (Belgium), registered with the Belgian Crossroads Bank for Enterprises under number BE 0817.750.283, hereinafter \"the Seller\".",
      "The Seller is the official and exclusive distributor of NISHMAN branded products for Belgium, France and the Grand Duchy of Luxembourg.",
      "They apply exclusively to customers acting in the course of their professional activity — hair salons, barbershops and beauty institutes — hereinafter \"the Customer\". The Seller does not contract with consumers within the meaning of Book VI of the Belgian Code of Economic Law.",
      "Any order implies unreserved acceptance of these terms, which prevail over any purchasing conditions of the Customer, unless otherwise agreed in writing beforehand by the Seller.",
    ]],
    ["2. Selective distribution network", [
      "The products distributed are professional cosmetic products whose quality, image and positioning justify selective distribution. To this end, the Seller operates a network of approved resellers.",
      "Access to the network is open to any applicant meeting the following objective criteria, applied on a non-discriminatory basis:",
      ["carrying on, as a principal activity, a duly registered professional activity in hairdressing, barbering or beauty care;",
       "holding a valid and verifiable VAT identification number;",
       "operating a physical point of sale open to customers, suitable for the presentation of professional cosmetic products;",
       "employing qualified staff able to advise customers on the use of the products;",
       "placing a first order of a minimum amount of one hundred (100) euros excluding VAT."],
      "Any applicant meeting these criteria is approved. The Customer undertakes to inform the Seller of any change affecting compliance with these criteria during the relationship.",
    ]],
    ["3. Resale of products", [
      "The Customer is authorised to resell the products to its end customers, exclusively from its approved physical point of sale, in the course of its professional activity.",
      "In order to preserve the quality, brand image and advisory service attached to the products, the following are prohibited:",
      ["resale to resellers not approved by the Seller, whether in Belgium or abroad;",
       "resale on online marketplaces of any kind, as well as on any general or discount online sales platform;",
       "resale to wholesalers, purchasing centres, discount stores or parallel channels;",
       "unpacking, repackaging, modifying or altering packaging, labels and legal notices."],
      "The Customer remains free to present the products on its own professional website and social media, in a manner consistent with the brand image and subject to Article 8.",
      "Failure to comply with these obligations entitles the Seller to suspend deliveries and terminate the commercial relationship, without prejudice to any damages.",
    ]],
    ["4. Pricing policy", [
      "Prices are expressed in euros, excluding value added tax. The applicable prices are those in force on the day the order is confirmed.",
      "The Seller may communicate recommended resale prices to the Customer. Such prices are purely indicative and in no way binding. The Customer freely determines its resale prices to end customers, and the Seller may not make deliveries, discounts or the continuation of the commercial relationship conditional upon them.",
      "The professional prices communicated to the Customer are confidential. The Customer undertakes not to disclose them to third parties, in particular to competing resellers.",
      "Commercial discounts may be granted depending on order volume, length of the relationship or specific negotiated conditions. Any discount is stated on the invoice and does not constitute a right for subsequent orders.",
    ]],
    ["5. Orders", [
      "Quotations and price offers issued by the Seller, in particular via the nishman.be website, are indicative and valid for thirty (30) days, subject to product availability.",
      "The sale is only complete once the order has been confirmed in writing by the Seller. The Seller reserves the right to refuse any order in the event of stock shortage, previous payment incident, or where the Customer no longer meets the approval criteria set out in Article 2.",
      "Any modification or cancellation of an order by the Customer requires the written agreement of the Seller.",
    ]],
    ["6. Payment", [
      "Unless otherwise agreed in writing, invoices are payable on receipt, without discount.",
      "Any invoice unpaid on its due date gives rise, automatically and without prior formal notice:",
      ["to late payment interest at the rate provided for by the Belgian Act of 2 August 2002 on late payment in commercial transactions;",
       "to fixed recovery compensation of forty (40) euros, without prejudice to the Seller's right to claim additional compensation."],
      "Non-payment of a single invoice on its due date renders the balance of all other invoices immediately payable, even those not yet due, and entitles the Seller to suspend any ongoing delivery.",
      "The Customer may not make any set-off or withholding without the written agreement of the Seller.",
    ]],
    ["7. Retention of title", [
      "The goods delivered remain the exclusive property of the Seller until full payment of the price in principal, interest and costs.",
      "Until full payment, the Customer undertakes not to pledge the goods or transfer ownership thereof by way of security. In the event of resale, the Customer's claim against its own buyer is automatically assigned to the Seller up to the amount outstanding.",
      "The Customer undertakes to inform the Seller immediately of any seizure or protective measure relating to goods not fully paid for, as well as of any insolvency proceedings concerning it.",
      "Notwithstanding the retention of title, the risks of loss or deterioration of the goods pass to the Customer upon delivery.",
    ]],
    ["8. Trademarks and intellectual property", [
      "The trademarks, names, logos, visuals and commercial documentation relating to the products remain the exclusive property of their respective owners. Nothing in these terms constitutes an assignment or licence of intellectual property rights to the Customer.",
      "The Customer is authorised to state its status as a reseller of the products and to promote them for the sole purpose of their resale. Any use of the trademarks and logos in commercial communications, signage, advertising material or online campaigns is subject to the prior written agreement of the Seller.",
      "The Customer undertakes not to register, as a trademark, trade name or domain name, any sign reproducing or imitating the distributed trademarks.",
    ]],
    ["9. Delivery", [
      "Unless otherwise agreed, delivery takes place within five (5) working days from receipt of payment, subject to product availability.",
      "Delivery costs are free of charge in Belgium, France and the Grand Duchy of Luxembourg, save for specific conditions agreed between the parties, in particular for express shipments, remote destinations or low-value orders.",
      "Delivery times are given for guidance only. A delay may not give rise to cancellation of the order, refusal of the goods, compensation or damages, except in the event of gross negligence by the Seller. The Seller reserves the right to make partial deliveries.",
    ]],
    ["10. Receipt, claims and returns", [
      "The Customer must check the condition and conformity of the goods upon receipt.",
      "Any claim relating to a shortage, a reference error or apparent damage must be notified in writing to contact@nishman.be within forty-eight (48) hours of receipt, together with photographs and the reference of the delivery document. After this period, the goods are deemed accepted without reservation.",
      "Hidden defects must be reported in writing within fifteen (15) days of their discovery.",
      "Returns of goods are accepted within fourteen (14) days of delivery, subject to the following cumulative conditions:",
      ["prior written agreement of the Seller;",
       "products in their original packaging, intact, unopened and unsealed;",
       "products in perfect resale condition, not labelled or marked by the Customer."],
      "No return is accepted for opened or used products, or products whose packaging is damaged, for reasons of hygiene and safety of cosmetic products. Return costs are borne by the Customer, except in the event of an error attributable to the Seller.",
    ]],
    ["11. Warranty, storage and regulatory compliance", [
      "The Seller warrants that the products comply with the manufacturer's specifications and with Regulation (EC) No 1223/2009 on cosmetic products.",
      "It is the Customer's responsibility to store the products under appropriate conditions — away from heat, humidity and direct light — to observe the minimum durability dates, and to ensure stock rotation. No warranty is due for deterioration resulting from inadequate storage conditions.",
      "The Customer undertakes not to market products whose minimum durability date has passed and to immediately withdraw from sale any product subject to a recall.",
      "The Seller's liability is limited to the replacement of products recognised as defective or to the reimbursement of their purchase price, excluding any indirect damage, loss of operation or loss of clientele.",
    ]],
    ["12. Duration, suspension and termination", [
      "The commercial relationship is entered into for an indefinite period. Either party may terminate it subject to one (1) month's written notice, without compensation.",
      "The Seller may suspend deliveries or terminate the relationship with immediate effect, without notice or compensation, in the event of non-payment, breach of Articles 2, 3 or 8, or insolvency proceedings affecting the Customer.",
      "Termination of the relationship does not affect ongoing orders or amounts due.",
    ]],
    ["13. Data protection", [
      "Personal data communicated by the Customer is processed by the Seller solely for the purposes of commercial management, order fulfilment, invoicing and monitoring of the business relationship, in accordance with Regulation (EU) 2016/679.",
      "This data is retained for the duration of the commercial relationship, plus the statutory accounting retention periods. The Customer has a right of access, rectification, erasure, restriction and objection, which may be exercised at contact@nishman.be.",
    ]],
    ["14. Force majeure", [
      "The Seller is not liable for non-performance or delay in performing its obligations resulting from an event of force majeure, in particular a supply failure by the manufacturer, strike, transport blockade, fire, natural disaster, administrative measure or epidemic.",
    ]],
    ["15. Partial invalidity and entire agreement", [
      "Should any clause of these terms be declared void or unenforceable, the other clauses shall retain their full effect. The clause concerned shall be replaced by a valid provision whose economic effect is as close as possible.",
      "These terms, together with the documents to which they refer, constitute the entire agreement between the parties.",
    ]],
    ["16. Governing law and jurisdiction", [
      "These general terms and conditions are governed by Belgian law.",
      "Any dispute relating to their formation, interpretation or performance falls within the exclusive jurisdiction of the courts of the judicial district of Hainaut, Mons division.",
    ]],
    ["17. Language", [
      "These general terms and conditions are drafted in French. Any translation is provided for information purposes only. In the event of any discrepancy between the French version and a translation, the French version prevails.",
    ]],
  ];

  CGV.nl = [
    ["1. Toepassingsgebied en aanvaarding", [
      "Deze algemene voorwaarden zijn van toepassing op alle verkopen gesloten door NBD Distribution SRL, met maatschappelijke zetel te Rue de la Poire d'Or 26, 7033 Cuesmes (België), ingeschreven bij de Kruispuntbank van Ondernemingen onder het nummer BE 0817.750.283, hierna « de Verkoper ».",
      "De Verkoper is de officiële en exclusieve verdeler van producten van het merk NISHMAN voor België, Frankrijk en het Groothertogdom Luxemburg.",
      "Zij zijn uitsluitend van toepassing op klanten die handelen in het kader van hun beroepsactiviteit — kapsalons, barbershops en instituten — hierna « de Klant ». De Verkoper contracteert niet met consumenten in de zin van boek VI van het Wetboek van economisch recht.",
      "Elke bestelling impliceert de onvoorwaardelijke aanvaarding van deze voorwaarden, die voorrang hebben op alle aankoopvoorwaarden van de Klant, behoudens voorafgaand schriftelijk akkoord van de Verkoper.",
    ]],
    ["2. Selectief distributienetwerk", [
      "De verdeelde producten zijn professionele cosmetische producten waarvan de kwaliteit, het imago en de positionering een selectieve distributie rechtvaardigen. De Verkoper organiseert hiertoe een netwerk van erkende verdelers.",
      "De toegang tot het netwerk staat open voor elke kandidaat die voldoet aan de volgende objectieve criteria, op niet-discriminerende wijze toegepast:",
      ["als hoofdactiviteit een naar behoren aangegeven beroepsactiviteit uitoefenen in kapperszaken, barberzaken of schoonheidsverzorging;",
       "beschikken over een geldig en verifieerbaar btw-identificatienummer;",
       "een fysiek verkooppunt uitbaten dat toegankelijk is voor het publiek en geschikt voor de presentatie van professionele cosmetica;",
       "beschikken over gekwalificeerd personeel dat de klanten kan adviseren over het gebruik van de producten;",
       "een eerste bestelling plaatsen van minimaal honderd (100) euro exclusief btw."],
      "Elke kandidaat die aan deze criteria voldoet, wordt erkend. De Klant verbindt zich ertoe de Verkoper op de hoogte te brengen van elke wijziging die de naleving van deze criteria beïnvloedt.",
    ]],
    ["3. Doorverkoop van de producten", [
      "De Klant mag de producten doorverkopen aan zijn eindklanten, uitsluitend vanuit zijn erkende fysieke verkooppunt, in het kader van zijn beroepsactiviteit.",
      "Om de kwaliteit, het merkimago en het advies verbonden aan de producten te vrijwaren, is het volgende verboden:",
      ["de doorverkoop aan verdelers die niet door de Verkoper zijn erkend, in België zowel als in het buitenland;",
       "de doorverkoop op online marktplaatsen van welke aard ook, alsook op elke algemene of discount verkoopsite;",
       "de doorverkoop aan groothandelaars, aankoopcentrales, stockverkopen of parallelle circuits;",
       "het uitpakken, herverpakken, wijzigen of aantasten van verpakkingen, etiketten en wettelijke vermeldingen."],
      "De Klant behoudt de mogelijkheid de producten voor te stellen op zijn eigen professionele website en sociale media, met respect voor het merkimago en onder voorbehoud van artikel 8.",
      "Niet-naleving van deze verplichtingen geeft de Verkoper het recht de leveringen op te schorten en de handelsrelatie te beëindigen, onverminderd elke schadevergoeding.",
    ]],
    ["4. Prijsbeleid", [
      "De prijzen zijn uitgedrukt in euro, exclusief belasting over de toegevoegde waarde. De toepasselijke prijzen zijn die welke gelden op de dag van de bevestiging van de bestelling.",
      "De Verkoper kan de Klant adviesverkoopprijzen meedelen. Deze prijzen zijn louter indicatief en hebben geen enkel bindend karakter. De Klant bepaalt vrij zijn doorverkoopprijzen aan de eindklanten, zonder dat de Verkoper de levering, de kortingen of de voortzetting van de handelsrelatie hiervan afhankelijk kan maken.",
      "De aan de Klant meegedeelde professionele tarieven zijn vertrouwelijk. De Klant verbindt zich ertoe deze niet aan derden mee te delen, in het bijzonder aan concurrerende verdelers.",
      "Commerciële kortingen kunnen worden toegekend op basis van het bestelde volume, de anciënniteit van de relatie of specifiek onderhandelde voorwaarden. Elke korting wordt vermeld op de factuur en vormt geen recht voor latere bestellingen.",
    ]],
    ["5. Bestellingen", [
      "De door de Verkoper uitgegeven offertes en prijsaanbiedingen, met name via de website nishman.be, hebben een indicatieve waarde en zijn dertig (30) dagen geldig, onder voorbehoud van beschikbaarheid van de producten.",
      "De verkoop is pas voltrokken na schriftelijke bevestiging van de bestelling door de Verkoper. De Verkoper behoudt zich het recht voor elke bestelling te weigeren bij voorraadbreuk, eerder betalingsincident, of wanneer de Klant niet langer voldoet aan de erkenningscriteria van artikel 2.",
      "Elke wijziging of annulering van een bestelling door de Klant vereist het schriftelijk akkoord van de Verkoper.",
    ]],
    ["6. Betaling", [
      "Behoudens andersluidende schriftelijke overeenkomst zijn de facturen betaalbaar bij ontvangst, zonder korting.",
      "Elke op de vervaldag onbetaalde factuur geeft van rechtswege en zonder voorafgaande ingebrekestelling aanleiding tot:",
      ["een verwijlintrest tegen het tarief bepaald door de wet van 2 augustus 2002 betreffende de betalingsachterstand bij handelstransacties;",
       "een forfaitaire invorderingsvergoeding van veertig (40) euro, onverminderd het recht van de Verkoper op aanvullende schadevergoeding."],
      "De niet-betaling van één enkele factuur op de vervaldag maakt het saldo van alle andere facturen onmiddellijk opeisbaar, zelfs de niet-vervallen, en geeft de Verkoper het recht elke lopende levering op te schorten.",
      "De Klant kan geen enkele schuldvergelijking of inhouding toepassen zonder schriftelijk akkoord van de Verkoper.",
    ]],
    ["7. Eigendomsvoorbehoud", [
      "De geleverde goederen blijven de exclusieve eigendom van de Verkoper tot de volledige betaling van de prijs in hoofdsom, intresten en kosten.",
      "Tot volledige betaling verbindt de Klant zich ertoe de goederen niet in pand te geven of in eigendom over te dragen bij wijze van zekerheid. Bij doorverkoop wordt de vordering van de Klant op zijn eigen koper van rechtswege aan de Verkoper overgedragen ten belope van het openstaande bedrag.",
      "De Klant verbindt zich ertoe de Verkoper onmiddellijk op de hoogte te brengen van elk beslag of bewarende maatregel op niet volledig betaalde goederen, alsook van elke insolventieprocedure die hem betreft.",
      "Niettegenstaande het eigendomsvoorbehoud gaan de risico's van verlies of beschadiging van de goederen over op de Klant vanaf de levering.",
    ]],
    ["8. Merken en intellectuele eigendom", [
      "De merken, benamingen, logo's, visuals en commerciële documentatie met betrekking tot de producten blijven de exclusieve eigendom van hun respectieve houders. Geen enkele bepaling van deze voorwaarden houdt een overdracht of licentie van intellectuele eigendomsrechten aan de Klant in.",
      "De Klant mag zijn hoedanigheid van verdeler van de producten kenbaar maken en deze promoten met als enig doel de doorverkoop ervan. Elk gebruik van de merken en logo's in commerciële communicatie, uithangborden, reclamedragers of onlinecampagnes is onderworpen aan het voorafgaand schriftelijk akkoord van de Verkoper.",
      "De Klant verbindt zich ertoe geen enkel teken dat de verdeelde merken reproduceert of nabootst te registreren als merk, handelsnaam of domeinnaam.",
    ]],
    ["9. Levering", [
      "Behoudens andersluidende overeenkomst vindt de levering plaats binnen vijf (5) werkdagen na ontvangst van de betaling, onder voorbehoud van beschikbaarheid van de producten.",
      "De leveringskosten zijn gratis in België, Frankrijk en het Groothertogdom Luxemburg, behoudens bijzondere voorwaarden overeengekomen tussen partijen, met name voor expreszendingen, verre bestemmingen of bestellingen van geringe waarde.",
      "De leveringstermijnen worden louter ter indicatie gegeven. Een vertraging kan geen aanleiding geven tot annulering van de bestelling, weigering van de goederen, vergoeding of schadeloosstelling, behoudens zware fout van de Verkoper. De Verkoper behoudt zich het recht voor gedeeltelijke leveringen te verrichten.",
    ]],
    ["10. Ontvangst, klachten en retours", [
      "De Klant dient de staat en de conformiteit van de goederen bij ontvangst te controleren.",
      "Elke klacht betreffende een tekort, een verkeerde referentie of zichtbare schade dient schriftelijk gemeld te worden aan contact@nishman.be binnen achtenveertig (48) uur na ontvangst, vergezeld van foto's en de referentie van het leveringsdocument. Na deze termijn worden de goederen geacht zonder voorbehoud te zijn aanvaard.",
      "Verborgen gebreken dienen schriftelijk gemeld te worden binnen vijftien (15) dagen na ontdekking.",
      "Retours van goederen worden aanvaard binnen veertien (14) dagen na levering, onder de volgende cumulatieve voorwaarden:",
      ["voorafgaand schriftelijk akkoord van de Verkoper;",
       "producten in hun originele, intacte, ongeopende en verzegelde verpakking;",
       "producten in perfecte staat voor doorverkoop, niet geëtiketteerd of gemarkeerd door de Klant."],
      "Geen enkele retour wordt aanvaard voor geopende of aangebroken producten, of producten waarvan de verpakking beschadigd is, om redenen van hygiëne en veiligheid van cosmetische producten. De retourkosten zijn ten laste van de Klant, behoudens fout van de Verkoper.",
    ]],
    ["11. Garantie, bewaring en regelgevende conformiteit", [
      "De Verkoper waarborgt de conformiteit van de producten met de specificaties van de fabrikant en met verordening (EG) nr. 1223/2009 betreffende cosmetische producten.",
      "Het komt de Klant toe de producten te bewaren onder gepaste omstandigheden — beschut tegen hitte, vocht en direct licht — de data van minimale houdbaarheid te respecteren en de rotatie van zijn voorraad te verzekeren. Geen enkele garantie is verschuldigd voor aantastingen die voortvloeien uit ongeschikte bewaaromstandigheden.",
      "De Klant verbindt zich ertoe geen producten te commercialiseren waarvan de datum van minimale houdbaarheid verstreken is en elk product dat het voorwerp uitmaakt van een terugroeping onmiddellijk uit de verkoop te nemen.",
      "De aansprakelijkheid van de Verkoper is beperkt tot de vervanging van als gebrekkig erkende producten of tot de terugbetaling van hun aankoopprijs, met uitsluiting van elke indirecte schade, bedrijfsverlies of verlies van cliënteel.",
    ]],
    ["12. Duur, opschorting en beëindiging", [
      "De handelsrelatie wordt aangegaan voor onbepaalde duur. Elke partij kan er een einde aan stellen mits een schriftelijke opzegtermijn van één (1) maand, zonder vergoeding.",
      "De Verkoper kan de leveringen opschorten of de relatie met onmiddellijke ingang beëindigen, zonder opzegtermijn noch vergoeding, bij niet-betaling, inbreuk op de artikelen 2, 3 of 8, of insolventieprocedure die de Klant treft.",
      "De beëindiging van de relatie doet geen afbreuk aan de lopende bestellingen noch aan de verschuldigde bedragen.",
    ]],
    ["13. Gegevensbescherming", [
      "De door de Klant meegedeelde persoonsgegevens worden door de Verkoper verwerkt met als enig doel het commercieel beheer, de uitvoering van de bestellingen, de facturatie en de opvolging van de zakelijke relatie, overeenkomstig verordening (EU) 2016/679.",
      "Deze gegevens worden bewaard gedurende de duur van de handelsrelatie, vermeerderd met de wettelijke boekhoudkundige bewaartermijnen. De Klant beschikt over een recht op inzage, verbetering, wissing, beperking en verzet, uit te oefenen op het adres contact@nishman.be.",
    ]],
    ["14. Overmacht", [
      "De Verkoper is niet aansprakelijk voor de niet-uitvoering of de vertraagde uitvoering van zijn verplichtingen als gevolg van overmacht, met name bij bevoorradingsonderbreking bij de fabrikant, staking, blokkering van het transport, brand, natuurramp, administratieve maatregel of epidemie.",
    ]],
    ["15. Gedeeltelijke nietigheid en volledigheid", [
      "Indien een clausule van deze voorwaarden nietig of niet-afdwingbaar zou worden verklaard, behouden de overige clausules hun volle uitwerking. De betrokken clausule wordt vervangen door een geldige bepaling waarvan het economisch effect zo dicht mogelijk aanleunt.",
      "Deze voorwaarden, samen met de documenten waarnaar zij verwijzen, vormen de volledige overeenkomst tussen partijen.",
    ]],
    ["16. Toepasselijk recht en bevoegde rechtbank", [
      "Deze algemene voorwaarden zijn onderworpen aan het Belgisch recht.",
      "Elk geschil betreffende de totstandkoming, interpretatie of uitvoering ervan behoort tot de exclusieve bevoegdheid van de hoven en rechtbanken van het gerechtelijk arrondissement Henegouwen, afdeling Bergen.",
    ]],
    ["17. Taal", [
      "Deze algemene voorwaarden zijn opgesteld in het Frans. Elke vertaling wordt uitsluitend ter informatie verstrekt. In geval van tegenstrijdigheid tussen de Franse versie en een vertaling, heeft de Franse versie voorrang.",
    ]],
  ];

  CGV.de = [
    ["1. Anwendungsbereich und Annahme", [
      "Diese Allgemeinen Geschäftsbedingungen gelten für alle Verkäufe der NBD Distribution SRL mit Sitz in Rue de la Poire d'Or 26, 7033 Cuesmes (Belgien), eingetragen in der Zentralen Datenbank der Unternehmen unter der Nummer BE 0817.750.283, nachfolgend „der Verkäufer\".",
      "Der Verkäufer ist der offizielle und exklusive Distributor der Produkte der Marke NISHMAN für Belgien, Frankreich und das Großherzogtum Luxemburg.",
      "Sie gelten ausschließlich für Kunden, die im Rahmen ihrer beruflichen Tätigkeit handeln — Friseursalons, Barbershops und Institute — nachfolgend „der Kunde\". Der Verkäufer schließt keine Verträge mit Verbrauchern im Sinne von Buch VI des belgischen Wirtschaftsgesetzbuchs.",
      "Jede Bestellung setzt die vorbehaltlose Annahme dieser Bedingungen voraus, die Vorrang vor allen Einkaufsbedingungen des Kunden haben, sofern nicht zuvor schriftlich anders vereinbart.",
    ]],
    ["2. Selektives Vertriebsnetz", [
      "Die vertriebenen Produkte sind professionelle Kosmetikprodukte, deren Qualität, Image und Positionierung einen selektiven Vertrieb rechtfertigen. Der Verkäufer unterhält zu diesem Zweck ein Netz zugelassener Wiederverkäufer.",
      "Der Zugang zum Netz steht jedem Bewerber offen, der die folgenden objektiven und diskriminierungsfrei angewandten Kriterien erfüllt:",
      ["Ausübung einer ordnungsgemäß angemeldeten beruflichen Haupttätigkeit im Friseur-, Barber- oder Kosmetikbereich;",
       "Besitz einer gültigen und überprüfbaren Umsatzsteuer-Identifikationsnummer;",
       "Betrieb einer für Kunden zugänglichen physischen Verkaufsstelle, die für die Präsentation professioneller Kosmetikprodukte geeignet ist;",
       "Beschäftigung von qualifiziertem Personal, das die Kunden zur Anwendung der Produkte beraten kann;",
       "Aufgabe einer Erstbestellung im Mindestwert von einhundert (100) Euro zzgl. MwSt."],
      "Jeder Bewerber, der diese Kriterien erfüllt, wird zugelassen. Der Kunde verpflichtet sich, den Verkäufer über jede Änderung zu informieren, die die Einhaltung dieser Kriterien betrifft.",
    ]],
    ["3. Weiterverkauf der Produkte", [
      "Der Kunde ist berechtigt, die Produkte im Rahmen seiner beruflichen Tätigkeit an seine Endkunden weiterzuverkaufen, ausschließlich von seiner zugelassenen physischen Verkaufsstelle aus.",
      "Zur Wahrung der Qualität, des Markenimages und der mit den Produkten verbundenen Beratung ist Folgendes untersagt:",
      ["der Weiterverkauf an vom Verkäufer nicht zugelassene Wiederverkäufer, in Belgien wie im Ausland;",
       "der Weiterverkauf auf Online-Marktplätzen jeglicher Art sowie auf allgemeinen oder Discount-Verkaufsplattformen;",
       "der Weiterverkauf an Großhändler, Einkaufszentralen, Restpostenmärkte oder Parallelvertriebswege;",
       "das Auspacken, Umpacken, Verändern oder Beeinträchtigen von Verpackungen, Etiketten und gesetzlichen Angaben."],
      "Der Kunde behält die Möglichkeit, die Produkte auf seiner eigenen professionellen Website und in seinen sozialen Netzwerken darzustellen, unter Wahrung des Markenimages und vorbehaltlich Artikel 8.",
      "Ein Verstoß gegen diese Pflichten berechtigt den Verkäufer, die Lieferungen auszusetzen und die Geschäftsbeziehung zu beenden, unbeschadet etwaiger Schadensersatzansprüche.",
    ]],
    ["4. Preispolitik", [
      "Die Preise verstehen sich in Euro, zuzüglich Mehrwertsteuer. Anwendbar sind die am Tag der Auftragsbestätigung geltenden Preise.",
      "Der Verkäufer kann dem Kunden empfohlene Wiederverkaufspreise mitteilen. Diese Preise sind rein unverbindlich. Der Kunde bestimmt seine Wiederverkaufspreise an Endkunden frei, ohne dass der Verkäufer Lieferungen, Rabatte oder die Fortsetzung der Geschäftsbeziehung davon abhängig machen darf.",
      "Die dem Kunden mitgeteilten Fachhandelspreise sind vertraulich. Der Kunde verpflichtet sich, sie nicht an Dritte, insbesondere nicht an konkurrierende Wiederverkäufer, weiterzugeben.",
      "Handelsrabatte können je nach Bestellvolumen, Dauer der Geschäftsbeziehung oder ausgehandelten Sonderkonditionen gewährt werden. Jeder Rabatt wird auf der Rechnung ausgewiesen und begründet keinen Anspruch für spätere Bestellungen.",
    ]],
    ["5. Bestellungen", [
      "Die vom Verkäufer erstellten Angebote und Preisofferten, insbesondere über die Website nishman.be, sind unverbindlich und dreißig (30) Tage gültig, vorbehaltlich der Verfügbarkeit der Produkte.",
      "Der Kauf kommt erst nach schriftlicher Auftragsbestätigung durch den Verkäufer zustande. Der Verkäufer behält sich das Recht vor, jede Bestellung abzulehnen bei Lieferengpässen, früheren Zahlungsstörungen oder wenn der Kunde die Zulassungskriterien nach Artikel 2 nicht mehr erfüllt.",
      "Jede Änderung oder Stornierung einer Bestellung durch den Kunden bedarf der schriftlichen Zustimmung des Verkäufers.",
    ]],
    ["6. Zahlung", [
      "Sofern nicht schriftlich anders vereinbart, sind die Rechnungen bei Erhalt ohne Abzug zahlbar.",
      "Jede bei Fälligkeit nicht beglichene Rechnung führt von Rechts wegen und ohne vorherige Mahnung zu:",
      ["Verzugszinsen zum Satz des belgischen Gesetzes vom 2. August 2002 über Zahlungsverzug im Geschäftsverkehr;",
       "einer pauschalen Beitreibungsentschädigung von vierzig (40) Euro, unbeschadet des Rechts des Verkäufers auf zusätzlichen Schadensersatz."],
      "Die Nichtzahlung einer einzigen Rechnung bei Fälligkeit macht den Saldo aller übrigen Rechnungen sofort fällig, auch der noch nicht fälligen, und berechtigt den Verkäufer, laufende Lieferungen auszusetzen.",
      "Der Kunde darf ohne schriftliche Zustimmung des Verkäufers keine Aufrechnung oder Zurückbehaltung vornehmen.",
    ]],
    ["7. Eigentumsvorbehalt", [
      "Die gelieferte Ware bleibt bis zur vollständigen Bezahlung des Preises in Hauptsumme, Zinsen und Kosten ausschließliches Eigentum des Verkäufers.",
      "Bis zur vollständigen Bezahlung verpflichtet sich der Kunde, die Ware nicht zu verpfänden oder sicherungshalber zu übereignen. Im Falle des Weiterverkaufs wird die Forderung des Kunden gegen seinen eigenen Käufer in Höhe des offenen Betrags von Rechts wegen an den Verkäufer abgetreten.",
      "Der Kunde verpflichtet sich, den Verkäufer unverzüglich über jede Pfändung oder Sicherungsmaßnahme an nicht vollständig bezahlter Ware sowie über jedes ihn betreffende Insolvenzverfahren zu informieren.",
      "Ungeachtet des Eigentumsvorbehalts gehen die Gefahren des Verlusts oder der Beschädigung der Ware mit der Lieferung auf den Kunden über.",
    ]],
    ["8. Marken und geistiges Eigentum", [
      "Die Marken, Bezeichnungen, Logos, Bildmaterialien und Verkaufsunterlagen zu den Produkten bleiben ausschließliches Eigentum ihrer jeweiligen Inhaber. Keine Bestimmung dieser Bedingungen begründet eine Übertragung oder Lizenz von Rechten des geistigen Eigentums zugunsten des Kunden.",
      "Der Kunde ist berechtigt, auf seine Eigenschaft als Wiederverkäufer der Produkte hinzuweisen und diese ausschließlich zum Zweck des Weiterverkaufs zu bewerben. Jede Verwendung der Marken und Logos in Werbemitteln, Beschilderungen, Werbeträgern oder Onlinekampagnen bedarf der vorherigen schriftlichen Zustimmung des Verkäufers.",
      "Der Kunde verpflichtet sich, kein Zeichen, das die vertriebenen Marken nachbildet oder nachahmt, als Marke, Handelsnamen oder Domainnamen anzumelden.",
    ]],
    ["9. Lieferung", [
      "Sofern nicht anders vereinbart, erfolgt die Lieferung innerhalb von fünf (5) Werktagen nach Zahlungseingang, vorbehaltlich der Verfügbarkeit der Produkte.",
      "Die Lieferkosten sind in Belgien, Frankreich und im Großherzogtum Luxemburg kostenfrei, vorbehaltlich zwischen den Parteien vereinbarter Sonderkonditionen, insbesondere bei Expresssendungen, entfernten Zielorten oder Bestellungen mit geringem Wert.",
      "Lieferfristen sind unverbindliche Richtwerte. Eine Verzögerung berechtigt weder zur Stornierung der Bestellung noch zur Verweigerung der Ware, zu einer Entschädigung oder zu Schadensersatz, außer bei grobem Verschulden des Verkäufers. Der Verkäufer behält sich Teillieferungen vor.",
    ]],
    ["10. Annahme, Reklamationen und Rücksendungen", [
      "Der Kunde hat den Zustand und die Konformität der Ware bei Erhalt zu prüfen.",
      "Jede Reklamation wegen Fehlmengen, falscher Referenz oder offensichtlicher Beschädigung ist innerhalb von achtundvierzig (48) Stunden nach Erhalt schriftlich an contact@nishman.be zu melden, mit Fotos und der Referenz des Lieferscheins. Nach Ablauf dieser Frist gilt die Ware als vorbehaltlos angenommen.",
      "Versteckte Mängel sind innerhalb von fünfzehn (15) Tagen nach ihrer Entdeckung schriftlich anzuzeigen.",
      "Rücksendungen werden innerhalb von vierzehn (14) Tagen nach Lieferung unter folgenden kumulativen Bedingungen angenommen:",
      ["vorherige schriftliche Zustimmung des Verkäufers;",
       "Produkte in ihrer unversehrten, ungeöffneten und versiegelten Originalverpackung;",
       "Produkte in einwandfreiem, wiederverkaufsfähigem Zustand, vom Kunden weder etikettiert noch markiert."],
      "Für geöffnete oder angebrochene Produkte sowie für Produkte mit beschädigter Verpackung wird aus Gründen der Hygiene und Sicherheit von Kosmetikprodukten keine Rücksendung angenommen. Die Rücksendekosten trägt der Kunde, außer bei einem Fehler des Verkäufers.",
    ]],
    ["11. Gewährleistung, Lagerung und regulatorische Konformität", [
      "Der Verkäufer gewährleistet die Konformität der Produkte mit den Spezifikationen des Herstellers und mit der Verordnung (EG) Nr. 1223/2009 über kosmetische Mittel.",
      "Es obliegt dem Kunden, die Produkte unter geeigneten Bedingungen zu lagern — geschützt vor Hitze, Feuchtigkeit und direktem Licht — die Mindesthaltbarkeitsdaten einzuhalten und die Rotation seiner Bestände sicherzustellen. Für Beeinträchtigungen infolge unsachgemäßer Lagerung wird keine Gewähr übernommen.",
      "Der Kunde verpflichtet sich, keine Produkte mit überschrittenem Mindesthaltbarkeitsdatum zu vermarkten und jedes von einem Rückruf betroffene Produkt unverzüglich aus dem Verkauf zu nehmen.",
      "Die Haftung des Verkäufers beschränkt sich auf den Ersatz als mangelhaft anerkannter Produkte oder die Erstattung ihres Kaufpreises, unter Ausschluss jeglicher mittelbarer Schäden, Betriebsausfälle oder Kundenverluste.",
    ]],
    ["12. Dauer, Aussetzung und Beendigung", [
      "Die Geschäftsbeziehung wird auf unbestimmte Zeit geschlossen. Jede Partei kann sie unter Einhaltung einer schriftlichen Frist von einem (1) Monat ohne Entschädigung beenden.",
      "Der Verkäufer kann die Lieferungen aussetzen oder die Beziehung mit sofortiger Wirkung ohne Frist und ohne Entschädigung beenden bei Nichtzahlung, Verstoß gegen die Artikel 2, 3 oder 8 oder bei einem Insolvenzverfahren des Kunden.",
      "Die Beendigung der Beziehung berührt weder laufende Bestellungen noch geschuldete Beträge.",
    ]],
    ["13. Datenschutz", [
      "Die vom Kunden übermittelten personenbezogenen Daten werden vom Verkäufer ausschließlich zum Zweck der kaufmännischen Verwaltung, der Auftragsabwicklung, der Rechnungsstellung und der Pflege der Geschäftsbeziehung gemäß der Verordnung (EU) 2016/679 verarbeitet.",
      "Diese Daten werden für die Dauer der Geschäftsbeziehung zuzüglich der gesetzlichen buchhalterischen Aufbewahrungsfristen gespeichert. Der Kunde hat ein Recht auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch, das er unter contact@nishman.be ausüben kann.",
    ]],
    ["14. Höhere Gewalt", [
      "Der Verkäufer haftet nicht für die Nichterfüllung oder verspätete Erfüllung seiner Verpflichtungen infolge höherer Gewalt, insbesondere bei Lieferausfall des Herstellers, Streik, Transportblockade, Brand, Naturkatastrophe, behördlicher Maßnahme oder Epidemie.",
    ]],
    ["15. Teilnichtigkeit und Vollständigkeit", [
      "Sollte eine Klausel dieser Bedingungen für nichtig oder undurchsetzbar erklärt werden, behalten die übrigen Klauseln ihre volle Wirksamkeit. Die betreffende Klausel wird durch eine gültige Bestimmung ersetzt, deren wirtschaftliche Wirkung ihr möglichst nahekommt.",
      "Diese Bedingungen bilden zusammen mit den Dokumenten, auf die sie verweisen, die gesamte Vereinbarung zwischen den Parteien.",
    ]],
    ["16. Anwendbares Recht und Gerichtsstand", [
      "Diese Allgemeinen Geschäftsbedingungen unterliegen belgischem Recht.",
      "Für alle Streitigkeiten über ihr Zustandekommen, ihre Auslegung oder ihre Erfüllung sind ausschließlich die Gerichte des Gerichtsbezirks Hennegau, Abteilung Mons, zuständig.",
    ]],
    ["17. Sprache", [
      "Diese Allgemeinen Geschäftsbedingungen sind in französischer Sprache verfasst. Jede Übersetzung dient ausschließlich Informationszwecken. Bei Abweichungen zwischen der französischen Fassung und einer Übersetzung ist die französische Fassung maßgebend.",
    ]],
  ];

  CGV.tr = [
    ["1. Kapsam ve kabul", [
      "İşbu genel satış koşulları, kayıtlı merkezi Rue de la Poire d'Or 26, 7033 Cuesmes (Belçika) adresinde bulunan ve BE 0817.750.283 numarasıyla Belçika Ticaret Sicili'ne kayıtlı NBD Distribution SRL (bundan böyle « Satıcı ») tarafından yapılan tüm satışları düzenler.",
      "Satıcı, NISHMAN markalı ürünlerin Belçika, Fransa ve Lüksemburg Büyük Dükalığı için resmi ve münhasır distribütörüdür.",
      "Bu koşullar yalnızca mesleki faaliyetleri kapsamında hareket eden müşterilere — kuaför salonları, berber dükkânları ve güzellik merkezleri, bundan böyle « Müşteri » — uygulanır. Satıcı, Belçika Ekonomi Hukuku Kanunu'nun VI. Kitabı anlamında tüketicilerle sözleşme yapmaz.",
      "Her sipariş, Müşteri'nin satın alma koşullarına üstün gelen işbu koşulların kayıtsız şartsız kabulünü içerir; Satıcı'nın önceden yazılı onayı saklıdır.",
    ]],
    ["2. Seçici dağıtım ağı", [
      "Dağıtılan ürünler, kalitesi, imajı ve konumlandırması seçici dağıtımı haklı kılan profesyonel kozmetik ürünlerdir. Satıcı bu amaçla yetkili bayi ağı işletmektedir.",
      "Ağa erişim, ayrım gözetmeksizin uygulanan aşağıdaki nesnel kriterleri karşılayan her adaya açıktır:",
      ["asıl faaliyet olarak usulüne uygun şekilde beyan edilmiş kuaförlük, berberlik veya güzellik mesleğini icra etmek;",
       "geçerli ve doğrulanabilir bir vergi kimlik numarasına sahip olmak;",
       "müşterilere açık, profesyonel kozmetik ürünlerin sunumuna uygun fiziksel bir satış noktası işletmek;",
       "ürünlerin kullanımı konusunda müşterilere danışmanlık yapabilecek nitelikli personele sahip olmak;",
       "KDV hariç en az yüz (100) euro tutarında bir ilk sipariş vermek."],
      "Bu kriterleri karşılayan her aday yetkilendirilir. Müşteri, ilişki süresince bu kriterlere uyumu etkileyen her değişikliği Satıcı'ya bildirmeyi taahhüt eder.",
    ]],
    ["3. Ürünlerin yeniden satışı", [
      "Müşteri, ürünleri mesleki faaliyeti kapsamında, yalnızca yetkilendirilmiş fiziksel satış noktasından son müşterilerine yeniden satmaya yetkilidir.",
      "Ürünlere bağlı kalite, marka imajı ve danışmanlığın korunması amacıyla aşağıdakiler yasaktır:",
      ["Satıcı tarafından yetkilendirilmemiş bayilere, Belçika'da veya yurt dışında yeniden satış;",
       "her türlü çevrimiçi pazar yerinde ve genel veya indirim odaklı çevrimiçi satış sitelerinde yeniden satış;",
       "toptancılara, satın alma merkezlerine, stok mağazalarına veya paralel kanallara yeniden satış;",
       "ambalajların, etiketlerin ve yasal bilgilerin açılması, yeniden paketlenmesi, değiştirilmesi veya bozulması."],
      "Müşteri, marka imajına saygı çerçevesinde ve 8. madde saklı kalmak kaydıyla, ürünleri kendi profesyonel web sitesinde ve sosyal medyasında tanıtma imkânını korur.",
      "Bu yükümlülüklere uyulmaması, Satıcı'ya teslimatları askıya alma ve ticari ilişkiyi feshetme hakkı verir; her türlü tazminat hakkı saklıdır.",
    ]],
    ["4. Fiyat politikası", [
      "Fiyatlar euro cinsinden ve katma değer vergisi hariç olarak belirtilmiştir. Uygulanacak fiyatlar, siparişin onaylandığı gün geçerli olan fiyatlardır.",
      "Satıcı, Müşteri'ye tavsiye edilen yeniden satış fiyatları bildirebilir. Bu fiyatlar tamamen bilgilendirme amaçlıdır ve hiçbir bağlayıcılığı yoktur. Müşteri, son müşterilerine uygulayacağı yeniden satış fiyatlarını serbestçe belirler; Satıcı teslimatı, indirimleri veya ticari ilişkinin devamını buna bağlayamaz.",
      "Müşteri'ye bildirilen profesyonel tarifeler gizlidir. Müşteri bunları üçüncü kişilere, özellikle rakip bayilere açıklamamayı taahhüt eder.",
      "Sipariş hacmine, ilişkinin kıdemine veya müzakere edilen özel koşullara bağlı olarak ticari indirimler tanınabilir. Her indirim faturada belirtilir ve sonraki siparişler için bir hak teşkil etmez.",
    ]],
    ["5. Siparişler", [
      "Satıcı tarafından, özellikle nishman.be sitesi üzerinden düzenlenen teklifler bilgilendirme niteliğindedir ve ürünlerin mevcudiyeti saklı kalmak kaydıyla otuz (30) gün geçerlidir.",
      "Satış, ancak siparişin Satıcı tarafından yazılı olarak onaylanmasıyla tamamlanır. Satıcı, stok tükenmesi, önceki ödeme sorunu veya Müşteri'nin 2. maddedeki yetkilendirme kriterlerini artık karşılamaması hâlinde her siparişi reddetme hakkını saklı tutar.",
      "Müşteri tarafından yapılacak her sipariş değişikliği veya iptali, Satıcı'nın yazılı onayını gerektirir.",
    ]],
    ["6. Ödeme", [
      "Yazılı olarak aksi kararlaştırılmadıkça, faturalar teslim alındığında ıskontosuz olarak ödenir.",
      "Vadesinde ödenmeyen her fatura, önceden ihtara gerek olmaksızın kendiliğinden şunlara yol açar:",
      ["ticari işlemlerde ödeme gecikmelerine ilişkin 2 Ağustos 2002 tarihli Belçika kanununda öngörülen oranda gecikme faizi;",
       "Satıcı'nın ek tazminat talep etme hakkı saklı kalmak kaydıyla, kırk (40) euro tutarında maktu tahsilat tazminatı."],
      "Tek bir faturanın vadesinde ödenmemesi, henüz vadesi gelmemiş olanlar dâhil diğer tüm faturaların bakiyesini derhâl muaccel kılar ve Satıcı'ya devam eden her teslimatı askıya alma hakkı verir.",
      "Müşteri, Satıcı'nın yazılı onayı olmaksızın hiçbir mahsup veya alıkoyma işlemi yapamaz.",
    ]],
    ["7. Mülkiyeti muhafaza", [
      "Teslim edilen mallar, anapara, faiz ve masraflar dâhil bedelin tamamı ödenene kadar Satıcı'nın münhasır mülkiyetinde kalır.",
      "Tam ödeme yapılana kadar Müşteri, malları rehnetmemeyi veya teminat olarak devretmemeyi taahhüt eder. Yeniden satış hâlinde, Müşteri'nin kendi alıcısına karşı alacağı, kalan borç tutarı kadar kendiliğinden Satıcı'ya devredilir.",
      "Müşteri, tamamı ödenmemiş mallar üzerindeki her haciz veya ihtiyati tedbiri ve kendisiyle ilgili her iflas işlemini derhâl Satıcı'ya bildirmeyi taahhüt eder.",
      "Mülkiyeti muhafaza kaydına rağmen, malların kaybolma veya hasar görme riski teslimden itibaren Müşteri'ye geçer.",
    ]],
    ["8. Markalar ve fikrî mülkiyet", [
      "Ürünlere ilişkin markalar, adlar, logolar, görseller ve ticari belgeler, ilgili sahiplerinin münhasır mülkiyetinde kalır. İşbu koşulların hiçbir hükmü Müşteri lehine fikrî mülkiyet hakkı devri veya lisansı doğurmaz.",
      "Müşteri, ürünlerin bayisi olduğunu belirtmeye ve yalnızca yeniden satış amacıyla tanıtımını yapmaya yetkilidir. Markaların ve logoların ticari iletişimde, tabelalarda, reklam malzemelerinde veya çevrimiçi kampanyalarda kullanılması Satıcı'nın önceden yazılı onayına tabidir.",
      "Müşteri, dağıtılan markaları tekrarlayan veya taklit eden hiçbir işareti marka, ticaret unvanı veya alan adı olarak tescil ettirmemeyi taahhüt eder.",
    ]],
    ["9. Teslimat", [
      "Aksi kararlaştırılmadıkça teslimat, ürünlerin mevcudiyeti saklı kalmak kaydıyla, ödemenin alınmasından itibaren beş (5) iş günü içinde gerçekleşir.",
      "Teslimat masrafları Belçika, Fransa ve Lüksemburg Büyük Dükalığı'nda ücretsizdir; taraflarca kararlaştırılan özel koşullar, özellikle ekspres gönderiler, uzak destinasyonlar veya düşük tutarlı siparişler saklıdır.",
      "Teslimat süreleri bilgilendirme amaçlıdır. Bir gecikme, Satıcı'nın ağır kusuru dışında, siparişin iptaline, malın reddine, tazminata veya zarar-ziyan talebine yol açamaz. Satıcı kısmi teslimat yapma hakkını saklı tutar.",
    ]],
    ["10. Teslim alma, şikâyetler ve iadeler", [
      "Müşteri, malların durumunu ve uygunluğunu teslim alır almaz kontrol etmekle yükümlüdür.",
      "Eksiklik, referans hatası veya görünür hasara ilişkin her şikâyet, teslim alınmasından itibaren kırk sekiz (48) saat içinde, fotoğraflar ve teslimat belgesi referansı ile birlikte contact@nishman.be adresine yazılı olarak bildirilmelidir. Bu sürenin sonunda mallar kayıtsız şartsız kabul edilmiş sayılır.",
      "Gizli ayıplar, keşfedilmelerinden itibaren on beş (15) gün içinde yazılı olarak bildirilmelidir.",
      "Mal iadeleri, teslimattan itibaren on dört (14) gün içinde ve aşağıdaki koşulların tamamının sağlanması hâlinde kabul edilir:",
      ["Satıcı'nın önceden yazılı onayı;",
       "ürünlerin orijinal, sağlam, açılmamış ve mührü bozulmamış ambalajında olması;",
       "ürünlerin yeniden satışa uygun kusursuz durumda, Müşteri tarafından etiketlenmemiş ve işaretlenmemiş olması."],
      "Kozmetik ürünlerin hijyen ve güvenliği nedeniyle, açılmış veya kullanılmış ürünler ile ambalajı zarar görmüş ürünler için iade kabul edilmez. İade masrafları, Satıcı'ya atfedilebilir bir hata dışında Müşteri'ye aittir.",
    ]],
    ["11. Garanti, saklama ve mevzuata uygunluk", [
      "Satıcı, ürünlerin üretici spesifikasyonlarına ve kozmetik ürünlere ilişkin (AT) 1223/2009 sayılı Tüzüğe uygunluğunu garanti eder.",
      "Ürünlerin uygun koşullarda — ısıdan, nemden ve doğrudan ışıktan korunarak — saklanması, asgari dayanıklılık tarihlerine uyulması ve stok rotasyonunun sağlanması Müşteri'nin sorumluluğundadır. Uygun olmayan saklama koşullarından kaynaklanan bozulmalar için hiçbir garanti verilmez.",
      "Müşteri, asgari dayanıklılık tarihi geçmiş ürünleri satışa sunmamayı ve geri çağırmaya konu olan her ürünü derhâl satıştan çekmeyi taahhüt eder.",
      "Satıcı'nın sorumluluğu, kusurlu olduğu kabul edilen ürünlerin değiştirilmesi veya satın alma bedelinin iadesi ile sınırlıdır; dolaylı zararlar, işletme kaybı veya müşteri kaybı hariçtir.",
    ]],
    ["12. Süre, askıya alma ve fesih", [
      "Ticari ilişki belirsiz süreli olarak kurulur. Her iki taraf da bir (1) aylık yazılı ihbar süresiyle, tazminatsız olarak ilişkiye son verebilir.",
      "Satıcı; ödeme yapılmaması, 2., 3. veya 8. maddelere aykırılık ya da Müşteri'yi etkileyen bir iflas işlemi hâlinde teslimatları askıya alabilir veya ilişkiyi ihbarsız ve tazminatsız olarak derhâl feshedebilir.",
      "İlişkinin sona ermesi, devam eden siparişleri ve borçlu tutarları etkilemez.",
    ]],
    ["13. Verilerin korunması", [
      "Müşteri tarafından iletilen kişisel veriler, (AB) 2016/679 sayılı Tüzük uyarınca yalnızca ticari yönetim, siparişlerin yerine getirilmesi, faturalandırma ve iş ilişkisinin takibi amacıyla Satıcı tarafından işlenir.",
      "Bu veriler, ticari ilişkinin süresi boyunca ve yasal muhasebe saklama süreleri eklenerek muhafaza edilir. Müşteri; erişim, düzeltme, silme, sınırlama ve itiraz haklarına sahiptir ve bunları contact@nishman.be adresinden kullanabilir.",
    ]],
    ["14. Mücbir sebep", [
      "Satıcı, özellikle üreticinin tedarik kesintisi, grev, ulaşımın engellenmesi, yangın, doğal afet, idari tedbir veya salgın gibi mücbir sebeplerden kaynaklanan yükümlülüklerin yerine getirilmemesinden veya gecikmesinden sorumlu değildir.",
    ]],
    ["15. Kısmi hükümsüzlük ve bütünlük", [
      "İşbu koşullardan bir hükmün geçersiz veya uygulanamaz sayılması hâlinde, diğer hükümler tüm etkisini korur. İlgili hüküm, ekonomik etkisi mümkün olduğunca yakın olan geçerli bir hükümle değiştirilir.",
      "İşbu koşullar ve atıfta bulundukları belgeler, taraflar arasındaki anlaşmanın tamamını oluşturur.",
    ]],
    ["16. Uygulanacak hukuk ve yetkili mahkeme", [
      "İşbu genel koşullar Belçika hukukuna tabidir.",
      "Bunların kurulması, yorumlanması veya ifasına ilişkin her uyuşmazlık, Hainaut adli bölgesi, Mons şubesi mahkemelerinin münhasır yetkisindedir.",
    ]],
    ["17. Dil", [
      "İşbu genel koşullar Fransızca olarak düzenlenmiştir. Her çeviri yalnızca bilgilendirme amaçlıdır. Fransızca sürüm ile bir çeviri arasında farklılık olması hâlinde Fransızca sürüm esas alınır.",
    ]],
  ];

  // ---------- Rendu ----------

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render() {
    const t = UI[LANG] || UI.fr;
    document.documentElement.lang = LANG;
    document.getElementById("t-back").textContent = "‹ " + t.back;
    document.getElementById("t-eyebrow").textContent = t.eyebrow;
    document.getElementById("t-title").textContent = t.title;
    document.getElementById("t-sub").textContent = t.sub;
    document.getElementById("t-download").textContent = t.dl;
    var lb = document.getElementById("lang-btn-label") || document.getElementById("lang-btn");
    lb.textContent = LANG.toUpperCase();
    document.title = t.title + " — Nishman";

    const data = CGV[LANG] || CGV.fr;
    document.getElementById("legal-content").innerHTML = data.map((art) => {
      const corps = art[1].map((bloc) => {
        if (Array.isArray(bloc)) {
          return "<ul>" + bloc.map((li) => "<li>" + esc(li) + "</li>").join("") + "</ul>";
        }
        return "<p>" + esc(bloc) + "</p>";
      }).join("");
      return "<section><h2>" + esc(art[0]) + "</h2>" + corps + "</section>";
    }).join("");
  }

  function initLang() {
    const btn = document.getElementById("lang-btn");
    const panel = document.getElementById("lang-overlay");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => { panel.hidden = false; });
    panel.addEventListener("click", (e) => {
      if (e.target.id === "lang-overlay") panel.hidden = true;
      const choix = e.target.closest("[data-lang]");
      if (choix) {
        localStorage.setItem("nishman-lang", choix.dataset.lang);
        window.location.reload();
      }
    });
    panel.querySelectorAll("[data-lang]").forEach((el) => {
      el.classList.toggle("active", el.dataset.lang === LANG);
    });
  }

  document.addEventListener("DOMContentLoaded", () => { render(); initLang(); });
})();
