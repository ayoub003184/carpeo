(function () {
  "use strict";

  var pricing = window.CARPEO_PRICING;
  var form = document.getElementById("pricing-admin");
  var status = document.getElementById("admin-status");
  if (!pricing || !form) return;

  function row(key, definition, value) {
    return '<tr><td><strong>' + definition.label + '</strong></td>' +
      '<td><label class="sr" for="mode-' + key + '">Mode</label><select id="mode-' + key + '" data-mode="' + key + '">' +
      '<option value="price"' + (value.mode === "price" ? " selected" : "") + '>Prix affiché</option>' +
      '<option value="quote"' + (value.mode === "quote" ? " selected" : "") + '>Sur devis</option></select></td>' +
      '<td><label class="sr" for="price-' + key + '">Prix</label><input id="price-' + key + '" data-price="' + key + '" type="number" min="0" step="0.01" value="' + value.price + '"></td></tr>';
  }

  function paint() {
    var settings = pricing.load();
    var groups = {};
    Object.keys(pricing.definitions).forEach(function (key) {
      var def = pricing.definitions[key];
      (groups[def.group] = groups[def.group] || []).push(key);
    });
    var html = '<div class="panel"><label for="deposit-admin">Acompte de réservation (€)</label>' +
      '<input id="deposit-admin" type="number" min="0" step="0.01" value="' + settings.deposit + '" style="max-width:180px"></div>';
    Object.keys(groups).forEach(function (group) {
      html += '<h2>' + group + '</h2><div class="table-wrap"><table><thead><tr><th>Prestation</th><th>Affichage</th><th>Prix (€)</th></tr></thead><tbody>';
      groups[group].forEach(function (key) { html += row(key, pricing.definitions[key], settings.items[key]); });
      html += '</tbody></table></div>';
    });
    html += '<div class="btn-row" style="margin-top:1rem"><button class="btn btn-ocean" type="submit">Enregistrer</button>' +
      '<button class="btn btn-ghost" type="button" id="admin-reset">Rétablir les valeurs initiales</button></div>';
    form.innerHTML = html;
    document.querySelectorAll("[data-mode]").forEach(function (select) {
      function sync() {
        var input = document.querySelector('[data-price="' + select.getAttribute("data-mode") + '"]');
        input.disabled = select.value === "quote";
      }
      select.addEventListener("change", sync);
      sync();
    });
    document.getElementById("admin-reset").onclick = function () {
      pricing.reset();
      paint();
      status.textContent = "Valeurs initiales rétablies.";
    };
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var settings = pricing.load();
    settings.deposit = Math.max(0, Number(document.getElementById("deposit-admin").value) || 0);
    Object.keys(settings.items).forEach(function (key) {
      settings.items[key].mode = document.querySelector('[data-mode="' + key + '"]').value;
      settings.items[key].price = Math.max(0, Number(document.querySelector('[data-price="' + key + '"]').value) || 0);
    });
    pricing.save(settings);
    status.textContent = "Tarifs enregistrés dans ce navigateur. Les pages utilisent maintenant ces valeurs.";
    pricing.render(document);
  });

  paint();
})();
