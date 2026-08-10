import { jsPDF } from "jspdf";
window.jspdf = { jsPDF };

import { MUSCLE_LABEL, BADGE_LABEL } from "../data/labels.js";
import { state } from "../core/state.js";
import { $btnSharePdf } from "../core/dom.js";
import { activeDays } from "../core/adapters.js";

export async function buildAndSharePdf(){
  if(state.sharingPdf) return;
  state.sharingPdf = true;
  $btnSharePdf.disabled = true;
  try { await _buildAndSharePdf(); } finally { state.sharingPdf = false; $btnSharePdf.disabled = false; }
}

async function _buildAndSharePdf(){
  const days = activeDays().filter(d => d.ex && d.ex.length > 0);
  if(!days.length){ alert("Nenhum dia de treino para exportar."); return; }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:"mm", format:"a4" });
  const pw = 210, ph = 297, mx = 16, my = 16;
  const cw = pw - mx * 2;
  let y = my;
  let pg = 1;

  function checkPage(need){
    if(y + need > ph - my){
      drawFooter();
      pdf.addPage();
      pg++;
      y = my;
    }
  }

  function drawFooter(){
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text("strength-split", mx, ph - 8);
    pdf.text(String(pg), pw - mx, ph - 8, { align:"right" });
  }

  function fmtDate(d){
    return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
  }

  const planName = state.currentPlanName || "Meu Treino";
  const today = new Date();

  // Header
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(22);
  pdf.setTextColor(255, 90, 31);
  pdf.text("STRENGTH SPLIT", mx, y);
  y += 8;

  pdf.setFont("helvetica","normal");
  pdf.setFontSize(13);
  pdf.setTextColor(60);
  pdf.text(planName, mx, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setTextColor(140);
  pdf.text(fmtDate(today), mx, y);
  y += 12;

  // Days
  days.forEach(day => {
    checkPage(24);

    // Day heading
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(14);
    pdf.setTextColor(30);
    pdf.text(day.name, mx, y);

    const tagText = day.tag || day.focus || "";
    if(tagText){
      const nameW = pdf.getTextWidth(day.name);
      pdf.setFont("helvetica","normal");
      pdf.setFontSize(10);
      pdf.setTextColor(140);
      pdf.text("  " + tagText, mx + nameW, y);
    }
    y += 3;
    pdf.setDrawColor(220);
    pdf.line(mx, y, pw - mx, y);
    y += 6;

    day.ex.forEach((ex, idx) => {
      checkPage(18);
      renderExerciseLine(pdf, ex, idx + 1, mx, false);

      if(ex.superset){
        checkPage(14);
        renderExerciseLine(pdf, ex.superset, null, mx, true);
      }
    });

    y += 6;
  });

  drawFooter();

  function renderExerciseLine(p, ex, num, lx, isSuperset){
    const indent = isSuperset ? 8 : 0;
    const x = lx + indent;

    // Prefix
    if(isSuperset){
      p.setFont("helvetica","italic");
      p.setFontSize(9);
      p.setTextColor(255, 90, 31);
      p.text("+ Supersérie", x, y);
      y += 4.5;
    }

    // Name line
    p.setFont("helvetica","bold");
    p.setFontSize(10);
    p.setTextColor(30);
    const prefix = num ? num + ". " : "";
    p.text(prefix + ex.name, x, y);

    // Muscle tag
    const muscleLabel = MUSCLE_LABEL[ex.muscle] || ex.muscle || "";
    if(muscleLabel){
      const nameW = p.getTextWidth(prefix + ex.name);
      p.setFont("helvetica","normal");
      p.setFontSize(8);
      p.setTextColor(120);
      p.text("  " + muscleLabel, x + nameW, y);
    }
    y += 5;

    // Reps
    if(ex.reps && ex.reps.length){
      p.setFont("helvetica","normal");
      p.setFontSize(9);
      p.setTextColor(80);
      const repsStr = ex.reps.length + "× " + ex.reps.join("·");
      p.text(repsStr, x, y);
      y += 4.5;
    }

    // Badges
    const badges = (ex.badges || []).filter(b => BADGE_LABEL[b]);
    if(badges.length){
      p.setFont("helvetica","italic");
      p.setFontSize(8);
      p.setTextColor(140);
      p.text(badges.map(b => BADGE_LABEL[b]).join(" | "), x, y);
      y += 4.5;
    }

    // Note
    if(ex.note){
      p.setFont("helvetica","italic");
      p.setFontSize(8);
      p.setTextColor(160);
      const noteLines = p.splitTextToSize(ex.note, cw - indent);
      noteLines.forEach(ln => {
        checkPage(5);
        p.text(ln, x, y);
        y += 4;
      });
      y += 0.5;
    }

    y += 2;
  }

  // Share or download
  const dateStr = today.toISOString().slice(0,10);
  const slug = (state.currentPlanName || "treino").toLowerCase().replace(/\s+/g, "-");
  const filename = `strength-split-${slug}-${dateStr}.pdf`;

  try {
    const blob = pdf.output("blob");
    const file = new File([blob], filename, { type:"application/pdf" });
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file], title:"Meu treino", text: planName });
    } else {
      pdf.save(filename);
    }
  } catch(e){
    if(e.name !== "AbortError") alert("Erro ao gerar PDF: " + e.message);
  }
}

export function init(){
  $btnSharePdf.addEventListener("click", buildAndSharePdf);
}
