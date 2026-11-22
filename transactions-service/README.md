# Centavo Transactions Service (`transactions-service`)

Microservicio responsable de registrar, consultar, editar y categorizar los movimientos y gastos personales del usuario en **Centavo**.

## Requisitos

- Node.js 20+ (probado en Node.js 24)
- npm 10+

## Primeros pasos

```bash
cp .env.example .env
npm install
npm run dev
```

El servicio escuchará por defecto en `http://localhost:3002` (alineado con `VITE_TRANSACTIONS_SERVICE_URL` en `frontend/.env.example`).

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
| `POST` | `/transactions` | Registra una nueva transacción (`amount`, `category`, `date`, y opcionales `description`, `type`, `currency`) |
| `GET` | `/transactions` | Lista transacciones registradas (soporta filtros `?category=`, `?type=`, `?from=`, `?to=`) |
| `GET` | `/transactions/:id` | Obtiene el detalle de una transacción por su `id` |
| `PATCH` | `/transactions/:id` | Actualiza o recategoriza una transacción existente |

## Estructura del servicio

```text
transactions-service/
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
│   │   └── transaction.ts
│   ├── core/
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── repositories/
│   │   └── transactionRepository.ts
│   ├── services/
│   │   └── transactionService.ts
│   └── routes/
│       └── transactionRoutes.ts
└── tests/
    └── transaction.test.ts
```

## Variables de entorno

- `PORT`: puerto HTTP del servicio (por defecto `3002`).
- `CORS_ORIGIN`: origen permitido para peticiones desde el frontend (por defecto `http://localhost:5173`).
- `DEFAULT_CURRENCY`: código de moneda ISO 4217 por defecto para nuevas transacciones (por defecto `PEN`).
- `NODE_ENV`: entorno de ejecución (`development`, `test`, `production`).
