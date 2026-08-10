# Strength Split

Tracker de treino de musculação semanal — mobile-first, pt-BR, offline-first.

## O que é

Um SPA para acompanhar séries, repetições e carga ao longo da semana. Login com Google, dados sincronizados na nuvem (Firestore) com cache local para funcionar offline.

## Funcionalidades

- No primeiro acesso, escolha de um modelo de plano de treino (ou começar em branco); split semanal customizável por dia e por exercício
- Registro de carga e repetições por série, com superséries
- Sugestão automática de carga com auto-regulação
- Detecção de deload e acompanhamento de variantes de máquina por exercício
- Substituição de exercício só para o dia (sem alterar o plano)
- Gráficos de evolução por exercício
- Gamificação (XP, níveis, badges) e retrospectiva anual
- Exportação de dados e compartilhamento do treino em PDF
- Tema claro/escuro

## Stack

Vanilla JavaScript (ES6 modules), sem framework. Vite para dev/build, Firebase (Auth + Firestore) como backend, Chart.js para os gráficos, jsPDF para o compartilhamento em PDF.

## Estrutura

```
src/
├── domain/    lógica pura, testada (sem DOM, sem Firestore)
├── core/      infraestrutura (state, Firestore, feature flags, DOM cache)
├── features/  UI e orquestração, uma pasta por área do app
├── data/      catálogos estáticos (exercícios, scaffold neutro de dias da semana, modelos de plano)
└── styles/    CSS
```

## Rodando localmente

```
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção
npm test         # testes de domínio (Vitest)
npm run lint     # ESLint
```

## Deploy

GitHub Actions builda e publica em GitHub Pages a cada push em `main`.
