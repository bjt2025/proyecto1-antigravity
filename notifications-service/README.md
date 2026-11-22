# Centavo Notifications Service (`notifications-service`)

Microservicio responsable de evaluar eventos de nuevas transacciones contra el presupuesto correspondiente y generar alertas de sobregasto en **Centavo**.

## Requisitos

- Node.js 20+ (probado en Node.js 24)
- npm 10+

## Primeros pasos

```bash
cp .env.example .env
npm install
npm run dev
```

El servicio escuchará por defecto en `http://localhost:3004` (alineado con `VITE_NOTIFICATIONS_SERVICE_URL` en `frontend/.env.example`).

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
| `POST` | `/notifications/events/transaction` | Recibe un evento de nueva transacción (`amount`, `category`, `date`, opcionales `transactionId`/`id`, `type`, `currency`, `previousSpent` o `accumulatedSpent`) y determina contra el presupuesto correspondiente si debe generar una alerta de sobregasto (`201 Created` si genera alerta, `200 OK` si no aplica o está dentro del presupuesto) |
| `GET` | `/notifications` | Lista las alertas generadas (soporta filtros `?category=`, `?period=`, `?status=unread|read`) |
| `GET` | `/notifications/:id` | Obtiene el detalle de una alerta por su `id` |
| `PATCH` | `/notifications/:id/read` | Marca una alerta como leída (`status: "read"`) |

### Reglas de evaluación de sobregasto

1. Las transacciones de tipo `income` no generan alertas (`reason: "INCOME_IGNORED"`).
2. Se consulta `budgets-service` (`GET /budgets?category=...`) y se selecciona el presupuesto más específico para la fecha de la transacción: primero período exacto `YYYY-MM`, y luego `monthly`, `weekly` o `yearly`.
3. Si no existe presupuesto coincidente (`NO_MATCHING_BUDGET`) o la moneda no coincide (`CURRENCY_MISMATCH`), no se genera alerta.
4. El gasto acumulado se calcula con `previousSpent` / `accumulatedSpent` si el evento lo incluye, o acumulando automáticamente por categoría y ventana del período (con idempotencia por `transactionId`).
5. Si el gasto total supera `limitAmount`, se registra y retorna la alerta (`reason: "BUDGET_EXCEEDED"`).

## Estructura del servicio

```text
notifications-service/
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
│   │   └── notification.ts
│   ├── clients/
│   │   └── budgetClient.ts
│   ├── core/
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── repositories/
│   │   └── notificationRepository.ts
│   ├── services/
│   │   └── notificationService.ts
│   └── routes/
│       └── notificationRoutes.ts
└── tests/
    └── notification.test.ts
```

## Variables de entorno

- `PORT`: puerto HTTP del servicio (por defecto `3004`).
- `CORS_ORIGIN`: origen permitido para peticiones desde el frontend (por defecto `http://localhost:5173`).
- `BUDGETS_SERVICE_URL`: URL base de `budgets-service` (por defecto `http://localhost:3003`).
- `BUDGETS_REQUEST_TIMEOUT_MS`: timeout en milisegundos para consultar presupuestos (por defecto `3000`).
- `DEFAULT_CURRENCY`: código de moneda ISO 4217 por defecto cuando el evento no especifica moneda (por defecto `PEN`).
- `NODE_ENV`: entorno de ejecución (`development`, `test`, `production`).
