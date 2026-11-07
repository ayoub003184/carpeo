# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(__file__).parent

HEAD = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="assets/favicon-32.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Poppins:wght@300;500;600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/styles.css">
{extra}
</head>
<body data-nav="{nav}">
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="site-header" data-header>
  <div class="wrap header-bar">
    <a class="brand" href="index.html" aria-label="CARPEO, accueil">
      <img class="brand-full" src="assets/logo-compact.webp" alt="CARPEO" width="181" height="132">
      <img class="brand-mark" src="assets/logo-symbol.webp" alt="" width="56" height="48">
    </a>
    <button class="nav-btn" type="button" aria-expanded="false" aria-controls="menu"><span class="sr">Menu</span><span></span><span></span><span></span></button>
    <nav id="menu" class="nav" aria-label="Navigation principale">
      <a href="index.html" data-nav="accueil">Accueil</a>
      <a href="services.html" data-nav="services">Services</a>
      <a href="tarifs.html" data-nav="tarifs">Tarifs</a>
      <a href="a-propos.html" data-nav="apropos">À propos</a>
      <a href="contact.html" data-nav="contact">Contact</a>
    </nav>
  </div>
</header>
<main id="contenu">
"""

FOOT = """
</main>
<footer class="site-footer">
  <div class="wrap foot-grid">
    <img class="foot-logo" src="assets/logo-compact-white.webp" alt="CARPEO, nettoyage textile" width="206" height="150">
    <div>
      <p>prolongez la vie de vos textiles</p>
      <p class="fine"><span data-area></span> · <span data-hours></span></p>
      <p class="fine">Horaires indicatifs, à confirmer. <a data-email href="mailto:contact@carpeo.fr">contact@carpeo.fr</a> · <span data-phone></span></p>
      <nav class="legal-links" aria-label="Liens de pied de page">
        <a href="mentions-legales.html">Mentions légales</a>
        <a href="confidentialite.html">Confidentialité</a>
        <a href="cgv.html">CGV</a>
        <a href="suivi.html">Suivi de dossier</a>
        <a href="reserver.html">Réserver</a>
        <button type="button" class="mini" id="cookie-reopen" style="color:#fff">Cookies</button>
      </nav>
    </div>
  </div>
</footer>
<div id="cookie-root"></div>
<button class="wa" type="button" data-wa aria-label="Écrire sur WhatsApp">
  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.123-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.405-9.884 9.823-9.884 2.626 0 5.094 1.024 6.95 2.882a9.821 9.821 0 0 1 2.874 6.953c-.003 5.45-4.406 9.884-9.823 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
</button>
<a class="call-fab" href="contact.html" data-call aria-label="Appeler CARPEO">
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="1.6"><path d="M7 3h3l1 4-2 1a12 12 0 0 0 6 6l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 5 5a2 2 0 0 1 2-2z"/></svg>
</a>
<script src="js/config.js"></script>
<script src="js/consent.js"></script>
<script src="js/main.js"></script>
{scripts}
</body>
</html>
"""

def page(name, title, desc, nav, body, extra="", scripts=""):
    html = HEAD.format(title=title, desc=desc, nav=nav, extra=extra) + body + FOOT.format(scripts=scripts)
    (ROOT / name).write_text(html, encoding="utf-8")
    print(name)

SOFA = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M4 12V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V12"/><path d="M3 12h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M7 19v1.5M17 19v1.5"/></svg></span>'
BED = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M3 18V8M3 14h18v4M21 14V10a3 3 0 0 0-3-3H11"/><path d="M3 18h18"/></svg></span>'
RUG = '<span class="icon"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 6v12M12 6v12M16 6v12"/></svg></span>'
CARPET = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M4 16c2-4 4-4 6 0s4 4 6 0 4-4 4 0"/><path d="M4 19h16"/></svg></span>'
CHAIR = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M7 11V5h10v6"/><path d="M6 11h12v3H6z"/><path d="M8 14v6M16 14v6"/></svg></span>'
SEAT = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M8 10V6h8v4"/><path d="M6 10h12v4H6z"/><path d="M8 14l-1 6M16 14l1 6"/></svg></span>'

INDEX = f"""
<section class="hero wrap">
  <div class="hero-copy">
    <p class="sur hero-line">Nettoyage textile</p>
    <h1 class="hero-line d2">Vos textiles retrouvent leur éclat</h1>
    <p class="lead hero-line d3">Prolongez la vie de vos textiles avec CARPEO. Canapés, matelas, tapis et moquettes nettoyés à domicile, avec une méthode adaptée à chaque fibre.</p>
    <div class="btn-row hero-line d4">
      <a class="btn btn-ocean" href="reserver.html">Réserver</a>
      <a class="btn btn-night" href="reserver.html?parcours=devis">Demander un devis</a>
    </div>
    <p class="hero-url" data-site>www.carpeo.fr</p>
  </div>
  <div class="hero-visual">
    <span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span>
    <img src="assets/photos/hero.webp" width="1400" height="952" alt="Salon lumineux avec un canapé clair et un grand tapis, lumière du jour. Visuel d'ambiance à remplacer par une photo CARPEO." fetchpriority="high">
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap trust">
    <article class="reveal"><strong data-count="4.9" data-decimals="1">0</strong><span>Note Google — exemple, à connecter à votre fiche</span></article>
    <article class="reveal"><strong>À domicile</strong><span>Intervention chez vous, maison ou local</span></article>
    <article class="reveal"><strong>Devis clair</strong><span>Prix ferme ou estimation, sans frais caché annoncé</span></article>
    <article class="reveal"><strong data-count="50" data-suffix=" %">0</strong><span>Acompte indicatif sur les prix fermes</span></article>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="sur">Prestations</p>
      <div class="gradient-bar"></div>
      <h2>Ce que nous nettoyons</h2>
      <p>Chaque textile a sa page, son parcours et son bouton : réserver quand le prix est ferme, demander un devis quand il faut voir la pièce.</p>
    </div>
    <div class="grid-6">
      <a class="card reveal" href="canapes.html">{SOFA}<h3>Canapés</h3><p>Dès 89 €, prix selon les places et l'angle.</p><span class="price-tag">Réserver</span></a>
      <a class="card reveal" href="matelas.html">{BED}<h3>Matelas</h3><p>79 € une face, 89 € deux faces.</p><span class="price-tag">Réserver</span></a>
      <a class="card reveal" href="tapis.html">{RUG}<h3>Tapis</h3><p>À partir de 39 €, après mesure.</p><span class="price-tag">Devis</span></a>
      <a class="card reveal" href="moquettes.html">{CARPET}<h3>Moquettes</h3><p>Surface au m², estimation sur place ou sur photo.</p><span class="price-tag">Devis</span></a>
      <a class="card reveal" href="fauteuils.html">{CHAIR}<h3>Fauteuils</h3><p>49 € l'unité.</p><span class="price-tag">Réserver</span></a>
      <a class="card reveal" href="chaises.html">{SEAT}<h3>Chaises</h3><p>25 € l'unité, 90 € les six.</p><span class="price-tag">Réserver</span></a>
    </div>
  </div>
</section>
<section class="section" style="background:var(--mist)">
  <div class="wrap grid-2">
    <div class="reveal">
      <p class="sur">Avant / après</p>
      <div class="gradient-bar"></div>
      <h2>Le même canapé, avant le passage</h2>
      <p>Faites glisser le curseur. L'image « avant » est une simulation sur la photo de droite : elle montre le fonctionnement du comparateur, pas un chantier CARPEO.</p>
      <p class="note">Photo à déposer : le même textile, même cadrage, avant et après l'extraction.</p>
    </div>
    <div class="ba reveal" data-ba style="--pos:58%">
      <img src="assets/photos/canape-avant-sale.webp" width="1400" height="933" alt="Canapé vert visiblement sale avant nettoyage, avec salissures incrustées et taches réalistes.">
      <div class="ba-top"><img src="assets/photos/canape-apres.webp" width="1400" height="933" alt="Canapé velours vert après le visuel de démonstration."></div>
      <span class="ba-label before">Avant</span>
      <span class="ba-label after">Après</span>
      <input class="ba-range" type="range" min="2" max="98" value="58" aria-label="Comparer le visuel avant et après">
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head">
      <p class="sur">Déroulement</p>
      <div class="gradient-bar"></div>
      <h2>Trois étapes, sans détour</h2>
    </div>
    <div class="grid-3 steps">
      <article class="step reveal"><h3>Vous décrivez</h3><p>Places, dimensions, taches, photos. Le formulaire s'adapte au textile.</p></article>
      <article class="step reveal"><h3>Vous choisissez</h3><p>Un prix ferme et un créneau, ou une demande de devis si la pièce doit être estimée.</p></article>
      <article class="step reveal"><h3>Nous intervenons</h3><p>À l'adresse indiquée. L'acompte est déduit du montant confirmé.</p></article>
    </div>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap grid-2">
    <figure class="reveal" style="margin:0">
      <img src="assets/photos/salon.webp" width="1400" height="933" alt="Canapé gris devant une fenêtre, lumière naturelle. Visuel d'ambiance à remplacer." style="border-radius:16px;width:100%;height:360px;object-fit:cover" loading="lazy">
      <figcaption class="note">Visuel d'ambiance libre de droits. À remplacer par une photo de salon réel.</figcaption>
    </figure>
    <div class="photo-slot reveal">
      <div>
        <p class="sur">Photo à déposer</p>
        <p>Technicien CARPEO, injecteur-extracteur sur un canapé, lumière du jour, gros plan fibre et mousse à côté.</p>
      </div>
    </div>
  </div>
</section>
<section class="section" style="background:var(--mist)">
  <div class="wrap">
    <div class="section-head">
      <p class="sur">Tarifs</p>
      <div class="gradient-bar"></div>
      <h2>Prix fermes, acompte de 50 %</h2>
      <p>Le solde se règle après l'intervention. Ces montants sont ceux du cahier des charges, à confirmer avant mise en ligne.</p>
    </div>
    <div class="table-wrap reveal">
      <table>
        <thead><tr><th>Prestation</th><th>Prix</th><th>Acompte</th></tr></thead>
        <tbody>
          <tr><td>Canapé 2 places</td><td>89 €</td><td>44,50 €</td></tr>
          <tr><td>Canapé 3 places</td><td>99 €</td><td>49,50 €</td></tr>
          <tr><td>Canapé d'angle 2 places</td><td>119 €</td><td>59,50 €</td></tr>
          <tr><td>Canapé d'angle 3 places</td><td>139 €</td><td>69,50 €</td></tr>
          <tr><td>Matelas 2 places, 1 face</td><td>79 €</td><td>39,50 €</td></tr>
          <tr><td>Matelas 2 places, 2 faces</td><td>89 €</td><td>44,50 €</td></tr>
          <tr><td>Fauteuil</td><td>49 €</td><td>24,50 €</td></tr>
          <tr><td>1 chaise</td><td>25 €</td><td>12,50 €</td></tr>
          <tr><td>6 chaises</td><td>90 €</td><td>45 €</td></tr>
          <tr><td>Tapis</td><td>dès 39 €</td><td>sur devis</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note" style="margin-top:0.8rem">Moquettes et coussins : uniquement sur devis. Frais de déplacement non indiqués dans la grille.</p>
    <a class="btn btn-ocean" href="tarifs.html" style="margin-top:1rem">Toute la grille</a>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="band reveal">
      <p class="sur">Deux parcours</p>
      <h2>Réserver ou faire estimer</h2>
      <p>Le prix s'affiche seulement quand la grille suffit. Sinon, CARPEO chiffre le dossier à la main, puis vous pourrez accepter le devis.</p>
      <div class="btn-row">
        <a class="btn btn-ocean" href="reserver.html">Réserver une prestation</a>
        <a class="btn btn-ghost" href="reserver.html?parcours=devis" style="color:#fff;border-color:#fff">Demander un devis</a>
      </div>
    </div>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="section-head">
      <p class="sur">Avis</p>
      <div class="gradient-bar"></div>
      <h2>La place des témoignages</h2>
      <p>Aucun avis client réel n'a été fourni. Les trois cartes ci-dessous montrent seulement la mise en page.</p>
    </div>
    <div class="quotes grid-3">
      <blockquote class="reveal"><span class="badge">Exemple</span><p>Le canapé a retrouvé une couleur uniforme. Intervention soignée, sans odeur forte au départ.</p><p class="note">Prénom, ville — à remplacer</p></blockquote>
      <blockquote class="reveal"><span class="badge">Exemple</span><p>Le créneau du matin a été respecté. Le solde correspondait bien à l'acompte déjà versé.</p><p class="note">Prénom, ville — à remplacer</p></blockquote>
      <blockquote class="reveal"><span class="badge">Exemple</span><p>Devis reçu avec les photos du tapis, puis un passage le samedi suivant.</p><p class="note">Prénom, ville — à remplacer</p></blockquote>
    </div>
  </div>
</section>
<section class="section" style="background:var(--mist)">
  <div class="wrap">
    <div class="section-head">
      <p class="sur">Questions</p>
      <div class="gradient-bar"></div>
      <h2>Avant de réserver</h2>
    </div>
    <details class="reveal"><summary>Une tache ancienne part-elle toujours ?</summary><p>Non. Une tache ancienne, ou qui a déjà abîmé la fibre, peut laisser une marque. Le formulaire le rappelle avant l'envoi.</p></details>
    <details class="reveal"><summary>L'acompte est-il remboursé si j'annule ?</summary><p>La règle commerciale envisagée est qu'un acompte n'est pas remboursé en cas d'annulation par le client. Elle doit être validée par un conseil avant publication, en distinguant acompte et arrhes, et les cas où la loi impose un remboursement.</p></details>
    <details class="reveal"><summary>Que puis-je payer en ligne aujourd'hui ?</summary><p>Le parcours calcule le prix et l'acompte. L'écran Stripe est prêt, mais aucun paiement réel n'est encaissé tant que le compte Stripe n'est pas relié.</p></details>
    <details class="reveal"><summary>Où intervenez-vous ?</summary><p>La zone exacte n'est pas encore communiquée. Elle sera affichée ici, sans adresse inventée.</p></details>
  </div>
</section>
<section class="section" id="contact-accueil">
  <div class="wrap contact-grid">
    <div>
      <p class="sur">Contact</p>
      <div class="gradient-bar"></div>
      <h2>Écrire ou appeler</h2>
      <p><a data-email href="mailto:contact@carpeo.fr">contact@carpeo.fr</a></p>
      <p><span data-phone></span></p>
      <p><span data-hours></span></p>
      <p><span data-area></span></p>
      <div class="btn-row">
        <a class="btn btn-ocean" data-email href="mailto:contact@carpeo.fr">E-mail</a>
        <button class="btn btn-night" type="button" data-wa>WhatsApp</button>
        <a class="btn btn-ghost" href="contact.html" data-call>Appeler</a>
      </div>
    </div>
    <div class="photo-slot">
      <div>
        <p class="sur">Carte</p>
        <p>La carte de la zone réelle sera placée ici. Pas de ville ni d'épingle fictives.</p>
      </div>
    </div>
  </div>
</section>
"""

page("index.html", "CARPEO — Nettoyage de canapés, matelas et tapis",
     "CARPEO prolonge la vie de vos textiles : nettoyage à domicile de canapés, matelas, tapis, moquettes, fauteuils et chaises. Prix clairs, devis et réservation.",
     "accueil", INDEX,
     extra='<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"CARPEO","description":"Nettoyage professionnel de textiles d\'ameublement à domicile.","url":"https://www.carpeo.fr","email":"contact@carpeo.fr","areaServed":"FR","priceRange":"€€","slogan":"prolongez la vie de vos textiles"}</script>')

SERVICES = f"""
<section class="section wrap">
  <p class="sur">Services</p>
  <div class="gradient-bar"></div>
  <h1>Les textiles pris en charge</h1>
  <p class="lead">Sept familles. Le bouton de chaque page dit si vous pouvez réserver tout de suite ou s'il faut un devis.</p>
  <div class="grid-6" style="margin-top:1.5rem">
    <a class="card" href="canapes.html">{SOFA}<h3>Canapés et sofas</h3><p>Prix selon places et configuration.</p></a>
    <a class="card" href="matelas.html">{BED}<h3>Matelas</h3><p>Une ou deux faces.</p></a>
    <a class="card" href="tapis.html">{RUG}<h3>Tapis</h3><p>Mesure en m², puis devis.</p></a>
    <a class="card" href="moquettes.html">{CARPET}<h3>Moquettes</h3><p>Surface posée, devis.</p></a>
    <a class="card" href="fauteuils.html">{CHAIR}<h3>Fauteuils</h3><p>49 € l'unité.</p></a>
    <a class="card" href="chaises.html">{SEAT}<h3>Chaises rembourrées</h3><p>25 €, ou 90 € les six.</p></a>
    <a class="card" href="coussins.html">{SOFA}<h3>Coussins</h3><p>Quantité et matière, sur devis.</p></a>
  </div>
</section>
"""
page("services.html", "Services de nettoyage textile — CARPEO",
     "Canapés, matelas, tapis, moquettes, fauteuils, chaises et coussins : les prestations CARPEO, à réserver ou à faire chiffrer.",
     "services", SERVICES)

def service(fname, title, h1, desc, img, alt, body, cta, cta_href):
    html = f"""
<section class="section wrap">
  <p class="sur">Prestation</p>
  <div class="gradient-bar"></div>
  <h1>{h1}</h1>
  <div class="grid-2" style="margin-top:1rem">
    <div class="prose">{body}<div class="btn-row"><a class="btn btn-ocean" href="{cta_href}">{cta}</a><a class="btn btn-ghost" href="tarifs.html">Voir les tarifs</a></div></div>
    <figure style="margin:0">
      <img src="{img}" alt="{alt}" width="1200" height="800" style="width:100%;height:360px;object-fit:cover;border-radius:16px" loading="lazy">
      <figcaption class="note">Visuel d'ambiance à remplacer par une photo de cette prestation.</figcaption>
    </figure>
  </div>
</section>
"""
    page(fname, title, desc, "services", html)

service("canapes.html", "Nettoyage de canapés — CARPEO", "Canapés et sofas",
        "Nettoyage de canapés 2 places, 3 places et d'angle. Prix ferme et réservation en ligne CARPEO.",
        "assets/photos/canape.webp", "Canapé velours vert dans une pièce claire. Photo d'ambiance à remplacer.",
        "<p>Le prix dépend du nombre de places et de la forme : droit ou angle. Une méridienne est comptée comme un angle, en attendant votre confirmation.</p><ul><li>2 places : 89 €</li><li>3 places : 99 €</li><li>Angle 2 places : 119 €</li><li>Angle 3 places : 139 €</li></ul><p>Acompte de 50 % au moment de la réservation. Le revêtement se précise dans le formulaire.</p>",
        "Réserver un canapé", "reserver.html")

service("matelas.html", "Nettoyage de matelas — CARPEO", "Matelas",
        "Nettoyage de matelas une face ou deux faces, à domicile, avec prix ferme CARPEO.",
        "assets/photos/matelas.webp", "Chambre lumineuse avec un lit fait. Photo d'ambiance à remplacer par un matelas en cours de nettoyage.",
        "<p>79 € pour une face, 89 € pour deux faces, pour un matelas 2 places. La quantité se multiplie dans le formulaire.</p><p>Indiquez les dimensions et les taches. Les odeurs persistantes se signalent à part : elles orientent le temps passé, sans changer seules le prix affiché.</p>",
        "Réserver un matelas", "reserver.html")

service("tapis.html", "Nettoyage de tapis — CARPEO", "Tapis",
        "Demande de devis pour le nettoyage de tapis. Indication à partir de 39 euros, surface calculée en m².",
        "assets/photos/tapis.webp", "Tapis clair à motifs, partiellement enroulé. Photo d'ambiance à remplacer.",
        "<p>La surface se calcule avec la longueur et la largeur, ou se saisit directement. Le tarif au mètre carré n'est pas fixé dans la grille : la demande part en devis. L'indication « à partir de 39 € » n'est pas un prix ferme.</p>",
        "Demander un devis tapis", "reserver.html?parcours=devis")

service("moquettes.html", "Nettoyage de moquettes — CARPEO", "Moquettes",
        "Devis pour le nettoyage de moquettes posées, selon la surface et l'état des fibres.",
        "assets/photos/moquette.webp", "Salon avec une grande moquette claire et un canapé. Photo d'ambiance à remplacer.",
        "<p>Une moquette posée se décrit par sa surface et par les pièces concernées. Le dossier est toujours estimé avant engagement, photos à l'appui.</p>",
        "Demander un devis moquette", "reserver.html?parcours=devis")

service("fauteuils.html", "Nettoyage de fauteuils — CARPEO", "Fauteuils",
        "Nettoyage de fauteuils à 49 euros l'unité, réservation en ligne CARPEO.",
        "assets/photos/fauteuil.webp", "Fauteuil jaune dans un salon clair. Photo d'ambiance à remplacer.",
        "<p>49 € le fauteuil, acompte 24,50 €. Précisez le revêtement et les particularités : accoudoirs bois, coutures fragiles, assise très tachée.</p>",
        "Réserver un fauteuil", "reserver.html")

service("chaises.html", "Nettoyage de chaises rembourrées — CARPEO", "Chaises rembourrées",
        "Chaises rembourrées : 25 euros l'unité ou 90 euros pour six, réservation CARPEO.",
        "assets/photos/chaises.webp", "Salle à manger avec six chaises rembourrées vertes. Photo d'ambiance à remplacer.",
        "<p>1 chaise : 25 €. Le lot de 6 est à 90 €. Au-delà, le calcul reprend des lots de six, puis le prix unitaire pour le reste. Exemple : 7 chaises = 90 € + 25 €.</p>",
        "Réserver des chaises", "reserver.html")

service("coussins.html", "Nettoyage de coussins — CARPEO", "Coussins",
        "Demande de devis pour le nettoyage de coussins : quantité, taille et matière.",
        "assets/photos/coussins.webp", "Coussins colorés sur un lit, lumière naturelle. Photo d'attente pour des coussins d'ameublement.",
        "<p>Les coussins et les fibres délicates passent par un devis : quantité, taille approximative, matière et photos. Pas de prix ferme tant que CARPEO n'a pas répondu.</p>",
        "Demander un devis", "reserver.html?parcours=devis")

TARIFS = """
<section class="section wrap prose">
  <p class="sur">Tarifs</p>
  <div class="gradient-bar"></div>
  <h1>Des prix lisibles</h1>
  <p class="lead">Un prix ferme est un montant calculé par la grille. Une estimation « à partir de » n'engage pas CARPEO tant qu'un devis n'est pas accepté.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Prestation</th><th>Prix ferme</th><th>Acompte 50 %</th><th>Parcours</th></tr></thead>
      <tbody>
        <tr><td>Canapé 2 places, droit</td><td>89 €</td><td>44,50 €</td><td>Réservation</td></tr>
        <tr><td>Canapé 3 places, droit</td><td>99 €</td><td>49,50 €</td><td>Réservation</td></tr>
        <tr><td>Canapé d'angle 2 places</td><td>119 €</td><td>59,50 €</td><td>Réservation</td></tr>
        <tr><td>Canapé d'angle 3 places</td><td>139 €</td><td>69,50 €</td><td>Réservation</td></tr>
        <tr><td>Matelas 2 places, une face</td><td>79 €</td><td>39,50 €</td><td>Réservation</td></tr>
        <tr><td>Matelas 2 places, deux faces</td><td>89 €</td><td>44,50 €</td><td>Réservation</td></tr>
        <tr><td>Fauteuil</td><td>49 €</td><td>24,50 €</td><td>Réservation</td></tr>
        <tr><td>Chaise rembourrée</td><td>25 €</td><td>12,50 €</td><td>Réservation</td></tr>
        <tr><td>Lot de 6 chaises</td><td>90 €</td><td>45 €</td><td>Réservation</td></tr>
        <tr><td>Tapis</td><td>dès 39 €</td><td>après devis</td><td>Devis</td></tr>
        <tr><td>Moquette, coussins, autre</td><td>sur devis</td><td>après devis</td><td>Devis</td></tr>
      </tbody>
    </table>
  </div>
  <h2>Ce qui n'est pas dans la grille</h2>
  <ul>
    <li>Frais de déplacement : non communiqués.</li>
    <li>Supplément selon la nature des taches : non communiqué.</li>
    <li>Tarif au m² des tapis et moquettes : non communiqué. Le formulaire calcule déjà la surface.</li>
  </ul>
  <p>Le prix d'un dossier confirmé devra rester celui accepté, même si la grille change ensuite. Cette règle est prête dans le parcours ; elle sera tenue par la base de données au moment du branchement serveur.</p>
  <a class="btn btn-ocean" href="reserver.html">Calculer ma prestation</a>
</section>
"""
page("tarifs.html", "Tarifs nettoyage textile — CARPEO",
     "Grille CARPEO : canapés, matelas, fauteuils et chaises au prix ferme, tapis à partir de 39 euros, moquettes et coussins sur devis.",
     "tarifs", TARIFS)

ABOUT = """
<section class="section wrap prose">
  <p class="sur">À propos</p>
  <div class="gradient-bar"></div>
  <h1>Prolonger la vie des textiles</h1>
  <p class="lead">CARPEO nettoie les textiles d'ameublement pour les garder en usage plus longtemps : canapés, matelas, tapis, moquettes, fauteuils, chaises et coussins.</p>
  <img src="assets/logo-full.webp" alt="Logo CARPEO complet : symbole, nom, signature et pictogrammes." width="420" height="420" style="width:min(420px,100%);height:auto;background:#FDFCF6">
  <h2>La promesse</h2>
  <p>prolongez la vie de vos textiles. L'entretien est choisi selon la matière, pour préserver les fibres. Les allégations plus précises sur les produits viendront quand la liste réelle des procédés sera fournie. Rien n'est affirmé au-delà de ça.</p>
  <h2>Ce que le site doit permettre</h2>
  <p>Montrer le service, donner un prix quand il est fiable, recueillir un devis quand il ne l'est pas, et garder une trace du dossier : statut, créneau, acompte.</p>
</section>
"""
page("a-propos.html", "À propos de CARPEO",
     "CARPEO, nettoyage professionnel de textiles d'ameublement. Promesse : prolonger la vie de vos textiles.",
     "apropos", ABOUT)

CONTACT = """
<section class="section wrap">
  <p class="sur">Contact</p>
  <div class="gradient-bar"></div>
  <h1>Nous écrire</h1>
  <div class="contact-grid">
    <div class="panel">
      <form id="contact-form">
        <div>
          <label for="c-nom">Nom</label>
          <input id="c-nom" name="nom" required autocomplete="name">
          <p class="field-error" hidden>Indiquez votre nom.</p>
        </div>
        <div>
          <label for="c-email">E-mail</label>
          <input id="c-email" name="email" type="email" required autocomplete="email">
          <p class="field-error" hidden>Indiquez un e-mail valide.</p>
        </div>
        <div>
          <label for="c-msg">Message</label>
          <textarea id="c-msg" name="message" required></textarea>
          <p class="field-error" hidden>Écrivez votre message.</p>
        </div>
        <button class="btn btn-ocean" type="submit">Envoyer</button>
      </form>
      <p id="contact-done" hidden>Message enregistré sur cette page seulement. Aucun e-mail n'est parti : le serveur n'est pas encore branché.</p>
    </div>
    <div>
      <p><strong>E-mail</strong><br><a data-email href="mailto:contact@carpeo.fr">contact@carpeo.fr</a></p>
      <p class="note">Adresse proposée pour la France. La charte graphique mentionne contact@carpeo.dz : à trancher.</p>
      <p><strong>Téléphone</strong><br><span data-phone></span></p>
      <p><strong>WhatsApp</strong><br><button type="button" class="mini" data-wa>Ouvrir WhatsApp</button></p>
      <p><strong>Horaires</strong><br><span data-hours></span></p>
      <p class="note">Horaires indicatifs, à confirmer.</p>
      <p><strong>Zone</strong><br><span data-area></span></p>
      <div class="photo-slot" style="margin-top:1rem"><p>Carte de la zone réelle, dès que les communes desservies sont connues.</p></div>
    </div>
  </div>
</section>
"""
page("contact.html", "Contact — CARPEO",
     "Contacter CARPEO par e-mail, téléphone ou WhatsApp. Zone d'intervention à confirmer.",
     "contact", CONTACT)

RESERVER = """
<section class="section wrap">
  <p class="sur">Réservation</p>
  <div class="gradient-bar"></div>
  <h1>Décrire la prestation</h1>
  <p class="lead">Ajoutez un ou plusieurs textiles. Le parcours devient une réservation si chaque article a un prix ferme, sinon une demande de devis.</p>
  <div id="booking"></div>
</section>
"""
page("reserver.html", "Réserver ou demander un devis — CARPEO",
     "Parcours CARPEO : textiles, taches, photos, adresse, créneau, acompte de 50 % et écran Stripe.",
     "accueil", RESERVER, scripts='<script src="js/booking.js"></script>')

SUIVI = """
<section class="section wrap">
  <p class="sur">Suivi</p>
  <div class="gradient-bar"></div>
  <h1>Votre dossier</h1>
  <p>La référence et la clé ont été affichées à la confirmation. Elles ne donnent accès qu'aux dossiers enregistrés dans ce navigateur.</p>
  <form id="suivi-form" class="panel" style="max-width:32rem">
    <label for="ref">Référence</label>
    <input id="ref" name="ref" required autocomplete="off" placeholder="CAR-">
    <label for="cle">Clé</label>
    <input id="cle" name="cle" required autocomplete="off">
    <button class="btn btn-ocean" type="submit">Consulter</button>
  </form>
  <div id="suivi-out" class="panel" style="margin-top:1rem"></div>
</section>
"""
page("suivi.html", "Suivi de dossier — CARPEO",
     "Consulter une demande ou une réservation CARPEO avec la référence et la clé.",
     "accueil", SUIVI, scripts='<script src="js/suivi.js"></script>')

MENTIONS = """
<section class="section wrap prose">
  <p class="sur">Juridique</p>
  <div class="gradient-bar"></div>
  <h1>Mentions légales</h1>
  <p class="note">Texte provisoire. Les mentions définitives dépendent de la forme de la société, du SIRET, du siège et de l'hébergeur. À faire valider.</p>
  <h2>Éditeur</h2>
  <p>CARPEO — raison sociale, forme juridique, capital, SIRET, RCS, TVA intracommunautaire et adresse du siège : à compléter.</p>
  <p>Contact : <a data-email href="mailto:contact@carpeo.fr">contact@carpeo.fr</a>. Téléphone : à communiquer. Directeur de la publication : à nommer.</p>
  <h2>Hébergement</h2>
  <p>Hébergeur non choisi. Nom, adresse et téléphone seront indiqués ici avant la mise en production.</p>
  <h2>Propriété</h2>
  <p>Le logo, les couleurs et la signature « prolongez la vie de vos textiles » appartiennent à CARPEO. Les photos d'ambiance actuelles sont des visuels temporaires.</p>
</section>
"""
page("mentions-legales.html", "Mentions légales — CARPEO",
     "Mentions légales provisoires du site CARPEO. Identité de l'éditeur et hébergeur à compléter.",
     "accueil", MENTIONS)

CONF = """
<section class="section wrap prose">
  <p class="sur">Juridique</p>
  <div class="gradient-bar"></div>
  <h1>Politique de confidentialité</h1>
  <p class="note">Trame à faire relire. Elle décrit le fonctionnement prévu du site, pas une analyse juridique définitive.</p>
  <h2>Données utilisées pour une demande</h2>
  <p>Nom, prénom, e-mail, téléphone, adresse d'intervention, caractéristiques des textiles, photos, créneau et origine du contact. Base : mesures précontractuelles, pour répondre à la réservation ou au devis.</p>
  <h2>Mesure d'audience et publicité</h2>
  <p>Google Analytics 4, Google Tag Manager, Meta Pixel et Google Ads ne se chargent qu'après un choix dans le bandeau. Le refus est proposé au même niveau que l'acceptation. Les données identifiantes ne sont pas envoyées en clair aux régies.</p>
  <h2>Paiement</h2>
  <p>Les données de carte seront saisies chez Stripe, pas dans la base CARPEO. Aujourd'hui, aucun paiement n'est transmis.</p>
  <h2>Durée et droits</h2>
  <p>Les dossiers de démonstration restent dans le navigateur jusqu'à effacement de l'historique local. En production : durée limitée au traitement, à la comptabilité et aux obligations légales. Accès, rectification, opposition, effacement et réclamation auprès de la CNIL : à l'adresse e-mail du site, dès qu'elle est confirmée.</p>
  <p>Le choix des cookies se modifie avec le lien « Cookies » en bas de page.</p>
</section>
"""
page("confidentialite.html", "Politique de confidentialité — CARPEO",
     "Données collectées par CARPEO pour les devis, les réservations et la mesure d'audience, après consentement.",
     "accueil", CONF)

CGV = """
<section class="section wrap prose">
  <p class="sur">Juridique</p>
  <div class="gradient-bar"></div>
  <h1>Conditions générales</h1>
  <p class="note">Projet de clauses, à valider par CARPEO et par un conseil avant toute publication. Le site ne tient pas lieu d'avis juridique.</p>
  <h2>Prestations</h2>
  <p>Nettoyage de textiles d'ameublement à l'adresse indiquée par le client. Un prix ferme vaut pour les articles de la grille. Un devis précise sa durée de validité, les prestations incluses et les suppléments.</p>
  <h2>Acompte</h2>
  <p>Sur un prix ferme, l'acompte affiché est de 50 %. Il est déduit du montant final : reste à payer = prix confirmé − acompte versé. Le prix accepté ne change pas si la grille est modifiée ensuite.</p>
  <h2>Annulation</h2>
  <p>La règle souhaitée est que l'acompte ne soit pas remboursé lorsque le client annule. Cette phrase ne sera opposable qu'après validation juridique. Il faudra distinguer l'acompte des arrhes, et les situations où la loi impose un remboursement ou un autre traitement, notamment pour certains contrats à distance.</p>
  <h2>Rétractation et médiation</h2>
  <p>Le droit de rétractation et l'information sur la médiation de la consommation dépendent de la situation exacte de CARPEO (prestation à une date choisie, exécution chez le client). Les coordonnées du médiateur seront ajoutées ici dès qu'elles seront connues. Elles ne sont pas inventées.</p>
  <h2>Résultat</h2>
  <p>Certaines taches anciennes ou qui ont altéré les fibres peuvent rester visibles après l'intervention.</p>
</section>
"""
page("cgv.html", "Conditions générales — CARPEO",
     "Conditions provisoires CARPEO : prix, acompte de 50 %, annulation et limites sur les taches anciennes.",
     "accueil", CGV)

pages = [
"index.html","services.html","canapes.html","matelas.html","tapis.html","moquettes.html",
"fauteuils.html","chaises.html","coussins.html","tarifs.html","a-propos.html","contact.html",
"reserver.html","suivi.html","mentions-legales.html","confidentialite.html","cgv.html"
]
urls = "\n".join(f"https://www.carpeo.fr/{p if p != 'index.html' else ''}" for p in pages)
(ROOT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls.splitlines()) +
    "\n</urlset>\n", encoding="utf-8")
(ROOT / "robots.txt").write_text("User-agent: *\nAllow: /\nSitemap: https://www.carpeo.fr/sitemap.xml\n", encoding="utf-8")
print("sitemap robots")
