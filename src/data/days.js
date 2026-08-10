export const DAYS = [
  { abbr:"Seg", name:"Segunda", tag:"Ombro · Costas", focus:"Ombro lateral/posterior · Costas", ex:[
    {name:"Elevação lateral com halter", muscle:"ombro", reps:[8,8,8,8], badges:["drop"]},
    {name:"Crucifixo invertido com halter", muscle:"ombro", reps:[12,10,10,8], note:"Apoiar o peito no banco da remada cavalinho."},
    {name:"Remada Hammer (anilhas)", muscle:"costas", reps:[12,10,10,8], badges:["iso"]},
    {name:"Remada unilateral com halter", muscle:"costas", reps:[8,8,8,8], note:"No banco inclinado."},
    {name:"Pulley frente — pegada supinada", muscle:"costas", reps:[12,10,10,8]},
  ]},
  { abbr:"Ter", name:"Terça", tag:"Posterior", focus:"Ombro frontal · Posterior de coxa · Glúteo", ex:[
    {name:"Elevação frontal com anilha", muscle:"ombro", reps:[8,8,8,8]},
    {name:"Cadeira abdutora", muscle:"perna", reps:[12,10,8,8], badges:["iso"]},
    {name:"Meio terra sumô", muscle:"perna", reps:[12,10,8,8]},
    {name:"Flexora sentado", muscle:"perna", reps:[12,10,10,8], badges:["iso","fast"]},
    {name:"Leg 45 unilateral", muscle:"perna", reps:[12,10,8,6]},
    {name:"Panturrilha sentado", muscle:"perna", reps:[15,15,15]},
  ]},
  { abbr:"Qua", name:"Quarta", tag:"Peito", focus:"Peito · Ombro", ex:[
    {name:"Supino vertical inclinado", muscle:"peito", reps:[12,10,8,8,8]},
    {name:"Peck deck", muscle:"peito", reps:[15,12,10,8,8]},
    {name:"Supino inclinado com barra", muscle:"peito", reps:[12,10,8,8,6]},
    {name:"Elevação frontal com anilha", muscle:"ombro", reps:[6,6,6,6,6],
      superset:{name:"Elevação lateral com halter (sentado)", muscle:"ombro", reps:[12,10,10,8,8]}},
    {name:"Desenvolvimento máquina", muscle:"ombro", reps:[12,10,8,8,8]},
  ]},
  { abbr:"Qui", name:"Quinta", tag:"Braços", focus:"Posterior de ombro · Tríceps · Bíceps", ex:[
    {name:"Face pull no Cross", muscle:"ombro", reps:[12,10,10,8,8], badges:["iso"],
      superset:{name:"Elevação lateral com halter", muscle:"ombro", reps:[8,8,8,8,8]}},
    {name:"Tríceps pulley com barra", muscle:"tríceps", reps:[9,9,9,9],
      superset:{name:"Rosca W", muscle:"bíceps", reps:[9,9,9,9]}},
    {name:"Tríceps francês com halter", muscle:"tríceps", reps:[8,8,8,8],
      superset:{name:"Rosca no Cross", muscle:"bíceps", reps:[8,8,8,8]}},
    {name:"Tríceps corda", muscle:"tríceps", reps:[12,10,10,8], badges:["iso"],
      superset:{name:"Martelo simultâneo com halter", muscle:"bíceps", reps:[12,10,8,8]}},
  ]},
  { abbr:"Sex", name:"Sexta", tag:"Pernas", focus:"Quadríceps · Adutor", ex:[
    {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12,12], badges:["iso","fast"], note:"Por série: 6 mov. com isometria + 6 acelerando."},
    {name:"Búlgaro com carga ipsilateral", muscle:"perna", reps:[12,10,8,8]},
    {name:"Leg 45", muscle:"perna", reps:[12,10,8,6]},
    {name:"Cadeira adutora", muscle:"perna", reps:[15,12,10,8]},
    {name:"Panturrilha sentado", muscle:"perna", reps:[15,15,15]},
  ]},
];

export const DAY_NAMES_SHORT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
