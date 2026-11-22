# Centavo Auth Service (`auth-service`)

Microservicio encargado del registro de usuarios, inicio de sesión, emisión y validación centralizada de sesiones y cierre de sesión para **Centavo**.

## Directivas obligatorias del servicio

Las reglas siguientes son vinculantes para cualquier cambio en `auth-service` (en complemento con [`AGENTS.md`](./AGENTS.md)):

1. **Nunca loguear credenciales ni tokens en texto plano**:
   - Todo log debe pasar por el logger central [`src/core/logger.ts`](./src/core/logger.ts), que redacta automáticamente campos y patrones sensibles (`password`, `passwordHash`, `token`, `authorization`, `secret`, `Bearer ...`, etc.).
   - Está prohibido registrar cuerpos de petición de autenticación (`req.body`), encabezados `Authorization`, cookies o contraseñas sin redactar.
2. **Módulo central único de validación de sesión**:
   - Toda verificación de tokens y sesiones debe pasar exclusivamente por [`src/core/sessionValidator.ts`](./src/core/sessionValidator.ts) (`validateSessionToken`, `validateAuthorizationHeader`, `requireAuth`).
   - Ningún otro módulo, ruta o middleware debe decodificar, verificar firmas o validar sesiones por separado.
3. **Lógica de hashing de contraseñas**:
   - El hashing y verificación de contraseñas reside exclusivamente en [`src/core/passwordHasher.ts`](./src/core/passwordHasher.ts).
   - **Algoritmo actual y justificación**: se utiliza `node:crypto` `scrypt` con salt criptográfico aleatorio de 16 bytes por contraseña (`N = 16384`, `r = 8`, `p = 1`, `keylen = 64`) y comparación en tiempo constante (`crypto.timingSafeEqual`). Se eligió `scrypt` nativo de Node.js por ser una KDF resistente a fuerza bruta en hardware especializado (*memory-hard*), sin dependencias nativas C++ que compliquen el despliegue multiplataforma.
   - **Cualquier cambio a esta lógica requiere justificación explícita en el plan antes de ejecutarse.**

## Requisitos

- Node.js 20+ (probado en Node.js 24)
- npm 10+

## Primeros pasos

```bash
cp .env.example .env
npm install
npm run dev
```

El servicio escuchará por defecto en `http://localhost:3001` (alineado con `VITE_AUTH_SERVICE_URL` en `frontend/.env.example`).

## Scripts disponibles

- `npm run dev`: inicia el servidor en modo desarrollo con recarga automática (`tsx watch`).
- `npm run build`: compila TypeScript a `dist/`.
- `npm start`: ejecuta el build compilado (`node dist/server.js`).
- `npm run typecheck`: valida tipos con `tsc --noEmit`.
- `npm test`: ejecuta la suite de pruebas (`tsx --test tests/*.test.ts`).

## Endpoints base

| Método | Ruta | Descripción | Autenticación |
| --- | --- | --- | --- |
| `GET` | `/health` | Estado del servicio (`200 OK`) | Pública |
| `POST` | `/auth/register` | Registro de usuario (`name`, `email`, `password`) y emisión de sesión | Pública |
| `POST` | `/auth/login` | Inicio de sesión (`email`, `password`) y emisión de sesión | Pública |
| `GET` | `/auth/verify` | Verifica el token `Bearer` y devuelve `{ valid, isAuthenticated, user, session }` | `Bearer <token>` |
| `GET` | `/auth/session` | Alias de `/auth/verify` usando el mismo validador central | `Bearer <token>` |
| `POST` | `/auth/logout` | Revoca la sesión activa asociada al token actual | `Bearer <token>` |

## Estructura del servicio

```text
auth-service/
├── AGENTS.md
├── README.md
├── src/
│   ├── config.ts
│   ├── app.ts
│   ├── server.ts
│   ├── types/
│   │   └── auth.ts
│   ├── core/
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── passwordHasher.ts
│   │   └── sessionValidator.ts
│   ├── repositories/
│   │   ├── sessionRepository.ts
│   │   └── userRepository.ts
│   ├── services/
│   │   └── authService.ts
│   └── routes/
│       └── authRoutes.ts
└── tests/
    └── auth.test.ts
```

## Variables de entorno

- `PORT`: puerto HTTP del servicio (por defecto `3001`).
- `CORS_ORIGIN`: origen permitido para peticiones desde el frontend (por defecto `http://localhost:5173`).
- `AUTH_TOKEN_SECRET`: secreto HMAC-SHA256 para firmar tokens de sesión. **En producción (`NODE_ENV=production`) es obligatorio definirlo con al menos 32 caracteres.**
- `SESSION_TTL_SECONDS`: duración de la sesión en segundos (por defecto `86400` = 24 horas).
- `NODE_ENV`: entorno de ejecución (`development`, `test`, `production`).
