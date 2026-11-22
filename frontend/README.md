# Centavo Frontend (Dashboard)

Interfaz web para la aplicación de finanzas personales **Centavo**.

## Requisitos

- Node.js 20+
- npm 10+

## Primeros pasos

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

## Scripts disponibles

- `npm run dev`: inicia el servidor de desarrollo de Vite.
- `npm run build`: verifica tipos con TypeScript y genera el bundle de producción en `dist/`.
- `npm run preview`: previsualiza el build de producción localmente.

## Estructura inicial

- `src/pages/LoginPage.tsx`: pantalla de inicio de sesión (scaffold listo para integrarse con `auth-service`).
- `src/pages/DashboardPage.tsx`: pantalla principal del dashboard con métricas iniciales y listado vacío de transacciones.
- `src/components/Layout.tsx`: shell principal del dashboard (barra lateral, cabecera y cierre de sesión).
- `src/components/TransactionsList.tsx`: tabla/listado de transacciones con estado vacío.
- `src/services/`: clientes HTTP base para `auth-service` y `transactions-service`.
