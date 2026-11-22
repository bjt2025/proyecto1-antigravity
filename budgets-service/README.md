# Centavo Budgets Service (`budgets-service`)

Microservicio responsable de definir y consultar los presupuestos por categoría y período del usuario en **Centavo**.

## Requisitos

- Node.js 20+ (probado en Node.js 24)
- npm 10+

## Primeros pasos

```bash
cp .env.example .env
npm install
npm run dev
```

El servicio escuchará por defecto en `http://localhost:3003` (alineado con `VITE_BUDGETS_SERVICE_URL` en `frontend/.env.example`).

## Scripts disponibles

- `npm run dev`: inicia el servidor en modo desarrollo con recarga automática (`tsx watch`).
- `npm run build`: compila TypeScript a `dist/`.
- `npm start`: ejecuta el build compilado (`node dist/server.js`).
- `npm run typecheck`: valida tipos con `tsc --noEmit`.
- `npm test`: ejecuta la suite de pruebas (`tsx --test tests/*.test.ts`).

## Endpoints base

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Estado del servicio (`200 OK`) |
| `POST` | `/budgets` | Crea un nuevo presupuesto (`category`, `limitAmount`, `period`, y opcional `currency`) |
| `GET` | `/budgets` | Lista los presupuestos configurados (soporta filtros `?category=`, `?period=`) |
| `GET` | `/budgets/:id` | Obtiene el detalle de un presupuesto por su `id` |

### Formatos válidos de `period`

- Período mensual específico: `YYYY-MM` (ejemplo: `2026-11`).
- Período recurrente: `weekly`, `monthly` o `yearly`.

## Estructura del servicio

```text
budgets-service/
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── src/
│   ├── config.ts
│   ├── app.ts
│   ├── server.ts
│   ├── types/
│   │   └── budget.ts
│   ├── core/
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── repositories/
│   │   └── budgetRepository.ts
│   ├── services/
│   │   └── budgetService.ts
│   └── routes/
│       └── budgetRoutes.ts
└── tests/
    └── budget.test.ts
```

## Variables de entorno

- `PORT`: puerto HTTP del servicio (por defecto `3003`).
- `CORS_ORIGIN`: origen permitido para peticiones desde el frontend (por defecto `http://localhost:5173`).
- `DEFAULT_CURRENCY`: código de moneda ISO 4217 por defecto para nuevos presupuestos (por defecto `PEN`).
- `NODE_ENV`: entorno de ejecución (`development`, `test`, `production`).
