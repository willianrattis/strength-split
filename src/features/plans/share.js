import { serializePlan } from "../../domain/plan-share.js";

// btoa only accepts Latin1 — escape/unescape round-trips arbitrary UTF-8 (pt-BR
// accents in exercise/plan names) through it safely.
export function encodeParam(obj){
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeParam(str){
  let b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while(b64.length % 4) b64 += "=";
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

export function buildPlanShareUrl(plan){
  const encoded = encodeParam(serializePlan(plan));
  return `${location.origin}${import.meta.env.BASE_URL}#plan=${encoded}`;
}

export async function sharePlan(plan){
  const url = buildPlanShareUrl(plan);
  if(navigator.share){
    try{
      await navigator.share({ title: plan.name, url });
    }catch(e){
      if(e.name !== "AbortError") alert("Erro ao compartilhar: " + e.message);
    }
    return;
  }
  try{
    await navigator.clipboard.writeText(url);
    showShareToast("Link copiado!");
  }catch(e){
    alert("Erro ao compartilhar: " + e.message);
  }
}

function showShareToast(msg){
  let $t = document.getElementById("shareToast");
  if(!$t){
    $t = document.createElement("div");
    $t.id = "shareToast";
    $t.className = "gamif-toast";
    document.body.appendChild($t);
  }
  $t.textContent = msg;
  $t.classList.remove("show");
  void $t.offsetWidth;
  $t.classList.add("show");
  clearTimeout($t._timer);
  $t._timer = setTimeout(() => $t.classList.remove("show"), 3000);
}
