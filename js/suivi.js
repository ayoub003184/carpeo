(function () {
  function euro(n) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  document.addEventListener("DOMContentLoaded", function () {
    var form=document.getElementById("suivi-form"),out=document.getElementById("suivi-out"),params=new URLSearchParams(location.search);
    if(params.get("ref"))document.getElementById("ref").value=params.get("ref");if(params.get("cle"))document.getElementById("cle").value=params.get("cle");
    async function show(ref,key){
      out.innerHTML="<p>Chargement du dossier…</p>";
      try{
        var response=await fetch("/api/bookings/"+encodeURIComponent(ref)+"?key="+encodeURIComponent(key),{headers:{Accept:"application/json"}}),found=await response.json();
        if(!response.ok)throw new Error(found.error||"Dossier introuvable");
        var money=found.total==null?"<p>Montant : en attente du devis.</p>":"<p>Total "+euro(found.total)+" · acompte "+euro(found.deposit)+" · reste "+euro(found.balance)+".</p>";
        var accept=found.type==="devis"&&found.quoteAmount!=null&&found.status!=="Accepté"?'<button class="btn btn-ocean" type="button" id="accept-quote">Accepter le devis de '+euro(found.quoteAmount)+"</button>":"";
        out.innerHTML="<h2>"+esc(found.ref)+"</h2><p><strong>"+esc(found.status)+"</strong></p><p>"+(found.type==="devis"?"Demande de devis":"Réservation")+" · "+new Date(found.created).toLocaleString("fr-FR")+"</p>"+(found.slot?"<p>Créneau : "+esc(found.slot)+"</p>":"<p>Créneau : pas encore planifié.</p>")+money+accept;
        var button=document.getElementById("accept-quote");if(button)button.onclick=async function(){button.disabled=true;var r=await fetch("/api/bookings/"+encodeURIComponent(ref)+"/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})});var data=await r.json();if(!r.ok){button.disabled=false;button.textContent=data.error||"Erreur";return;}show(ref,key);};
      }catch(error){out.innerHTML="<p class=\"field-error\">"+esc(error.message)+". Vérifiez la référence et la clé d’accès.</p>";}
    }
    form.addEventListener("submit",function(e){e.preventDefault();show(document.getElementById("ref").value.trim().toUpperCase(),document.getElementById("cle").value.trim().toUpperCase());});
    if(params.get("ref")&&params.get("cle"))show(params.get("ref").trim().toUpperCase(),params.get("cle").trim().toUpperCase());
  });
})();
