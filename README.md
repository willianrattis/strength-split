# Strength Split

Tracker de treino semanal em HTML puro — sem framework, sem backend, sem login.

## O que é

Página única com o split de 5 dias (Seg–Sex). Cada exercício pode ser marcado como concluído; o progresso é salvo localmente via `localStorage` e persiste entre sessões.

## Funcionalidades

- Navegação por dia com destaque automático no dia atual
- Esquemas de séries/repetições visuais (pirâmide e séries fixas)
- Superséries com conector visual
- Badges de técnica: Drop-set, Isometria 2s, Acelerar na fadiga
- Barra de progresso por dia
- 100% responsivo — desktop e mobile

## Estrutura

```
strength-split/
├── index.html      # aplicação completa
├── preview.png     # imagem Open Graph (1200×630)
└── preview.svg     # fonte editável da imagem
```