# Laboratorio 3 — CRUD Serverless de Libros

Cloud Computing · Universidad de Antioquia · 2026-2

## Integrantes

- Santiago Palacio (spalacioc05)
- _(completar con los demás integrantes del grupo)_

## Descripción

Este laboratorio implementa una API REST completamente serverless para
administrar una colección de **libros**. La API permite crear, listar,
consultar, actualizar y eliminar libros, usando exclusivamente servicios
administrados de AWS: no hay ningún servidor que aprovisionar ni mantener.

Toda la infraestructura (funciones, rutas HTTP, tabla y permisos) está
definida como código en un único archivo `serverless.yml`, siguiendo el
enfoque de Infraestructura como Código (IaC) con Serverless Framework v4.

## Arquitectura

```
Cliente / Postman
        |
        v
API Gateway HTTP API
        |
        v
   AWS Lambda (5 funciones: crear, listar, obtener, actualizar, eliminar)
        |
        v
   Amazon DynamoDB (tabla "libros")
```

Cada Lambda envía sus logs de ejecución a **Amazon CloudWatch**. El detalle
del diagrama (en Mermaid) está en [`docs/arquitectura.md`](docs/arquitectura.md).

## Entidad: Libro

| Atributo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | string (UUID) | generado automáticamente | Partition key de la tabla |
| `titulo` | string | sí | Título del libro |
| `autor` | string | sí | Autor del libro |
| `genero` | string | sí | Género literario |
| `paginas` | integer (> 0) | sí | Número de páginas |
| `disponible` | boolean | sí | Si el libro está disponible para préstamo |
| `creadoEn` | string (ISO 8601) | generado automáticamente | Fecha de creación del registro |

## Endpoints

| Método | Ruta | Función Lambda | Respuesta esperada |
|---|---|---|---|
| POST | `/libros` | `crear` | 201 con el libro creado · 400 si el body es inválido |
| GET | `/libros` | `listar` | 200 con el arreglo de libros |
| GET | `/libros/{id}` | `obtener` | 200 con el libro · 404 si no existe |
| PUT | `/libros/{id}` | `actualizar` | 200 con el libro actualizado · 400 · 404 |
| DELETE | `/libros/{id}` | `eliminar` | 200 con mensaje de confirmación · 404 |

## Códigos HTTP utilizados

| Código | Cuándo se usa |
|---|---|
| 200 | Consulta, actualización o eliminación exitosa |
| 201 | Creación exitosa |
| 400 | Body ausente, JSON inválido, o campos obligatorios faltantes/incorrectos |
| 404 | El `id` solicitado no existe en la tabla (obtener, actualizar, eliminar) |
| 500 | Error inesperado (por ejemplo, un fallo de DynamoDB no relacionado con la validación) |

## Estructura del proyecto

```
.
├── handler.js                                  # Las 5 funciones Lambda
├── serverless.yml                               # Infraestructura como código
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
├── postman/
│   └── Lab3-Serverless-Libros.postman_collection.json
└── docs/
    └── arquitectura.md
```

## Requisitos

- [Node.js](https://nodejs.org/) 20 o superior (probado con Node 24)
- [Serverless Framework v4](https://www.serverless.com/framework/docs/getting-started) (`npm install -g serverless`)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- Cuenta de AWS con permisos sobre Lambda, API Gateway, DynamoDB, IAM,
  CloudFormation y CloudWatch Logs
- Cuenta en [app.serverless.com](https://app.serverless.com) (Serverless Framework v4
  exige inicio de sesión incluso para comandos locales como `serverless print`)
- [Postman](https://www.postman.com/) para probar la API

## Instalación

```bash
git clone https://github.com/spalacioc05/lab3-serverless-libros.git
cd lab3-serverless-libros
npm install
```

Esto instala:

- `@aws-sdk/client-dynamodb` y `@aws-sdk/lib-dynamodb` (AWS SDK v3, dependencias de producción)
- `serverless-offline` (dependencia de desarrollo, para pruebas locales)

## `serverless.yml`, en breve

- **`service`**: `lab3-serverless-libros`.
- **`provider`**: runtime `nodejs24.x`, arquitectura `arm64` (más económica),
  región `us-east-1`, stage por defecto `dev`.
- **Variable de entorno**: `LIBROS_TABLE`, con el nombre de la tabla
  dependiente del stage (`${self:service}-libros-${sls:stage}`), para que el
  código nunca tenga el nombre de la tabla escrito a mano.
- **IAM de mínimo privilegio**: el rol de las Lambdas solo puede ejecutar
  `PutItem`, `GetItem`, `Scan`, `UpdateItem` y `DeleteItem`, y únicamente
  sobre el ARN de la tabla `LibrosTable` creada en este mismo stack
  (`Fn::GetAtt: [LibrosTable, Arn]`). No se otorga `dynamodb:*` ni `Resource: "*"`.
- **`functions`**: las cinco funciones (`crear`, `listar`, `obtener`,
  `actualizar`, `eliminar`), cada una con su propio evento `httpApi`.
- **`resources`**: la tabla DynamoDB en sintaxis CloudFormation, con
  `BillingMode: PAY_PER_REQUEST` (pago por uso, sin capacidad reservada) y
  `id` como partition key de tipo `String`.
- **`plugins`**: `serverless-offline`.

> `org` y `app` quedan comentados en el archivo. Antes de ejecutar
> `serverless deploy` deben descomentarse y ajustarse a la organización real
> de la cuenta en app.serverless.com.

## `handler.js`, en breve

- El `DynamoDBClient` y el `DynamoDBDocumentClient` se crean **una sola vez,
  fuera de los handlers**, para reutilizar la conexión entre invocaciones
  (buena práctica de rendimiento en Lambda).
- `respuesta(statusCode, body)`: helper para construir siempre una respuesta
  HTTP en el mismo formato (JSON + header `Content-Type`).
- `leerBody(event)`: hace `JSON.parse` del body de forma segura; si el JSON
  es inválido devuelve `null` en lugar de lanzar una excepción.
- `validarLibro(data)`: valida `titulo`, `autor`, `genero`, `paginas` y
  `disponible`; devuelve un mensaje de error o `null` si todo es válido.
- `crear`: valida, genera `id` (`crypto.randomUUID()`) y `creadoEn`, guarda
  con `PutCommand` y responde `201`.
- `listar`: `ScanCommand` sobre toda la tabla, responde `200` con el arreglo.
- `obtener`: `GetCommand` por `id`; `404` si no existe.
- `actualizar`: valida el body igual que `crear`, usa `UpdateCommand` con
  `UpdateExpression`, `ExpressionAttributeValues`, `ReturnValues: "ALL_NEW"`
  y `ConditionExpression: attribute_exists(id)`. Si el `id` no existe,
  DynamoDB lanza `ConditionalCheckFailedException`, que se captura para
  responder `404` **en lugar de crear un registro nuevo por accidente**.
- `eliminar`: `DeleteCommand` con la misma `ConditionExpression`, para
  responder `404` si el `id` no existía en lugar de un `200` engañoso.

## Configurar credenciales de AWS (antes del despliegue)

Este paso todavía no se ha realizado en este proyecto. Cuando se vaya a
desplegar en AWS:

```bash
aws configure
```

Y proporcionar `AWS Access Key ID`, `AWS Secret Access Key`, región
(`us-east-1`) y formato de salida. Alternativamente, se puede conectar un
proveedor de AWS desde el dashboard de Serverless
([app.serverless.com](https://app.serverless.com)).

## Cómo desplegar (fase AWS, todavía no ejecutado en este repositorio)

```bash
serverless deploy
```

Al finalizar, la terminal imprime la URL base de API Gateway. Esa URL debe
reemplazar la variable `baseUrl` en la colección de Postman (sección
"Producción (AWS)").

## Cómo ejecutar en modo local

```bash
serverless offline
```

Esto levanta la API en `http://localhost:3000`. Como el código necesita una
tabla real de DynamoDB, este modo debe ejecutarse **después** de haber hecho
`serverless deploy` al menos una vez, para que `LIBROS_TABLE` apunte a una
tabla que realmente existe en AWS.

## Ejemplos de requests

**Crear libro** — `POST /libros`

```json
{
  "titulo": "Cien años de soledad",
  "autor": "Gabriel García Márquez",
  "genero": "Realismo mágico",
  "paginas": 471,
  "disponible": true
}
```

**Actualizar libro** — `PUT /libros/{id}`

```json
{
  "titulo": "Cien años de soledad (edición conmemorativa)",
  "autor": "Gabriel García Márquez",
  "genero": "Realismo mágico",
  "paginas": 496,
  "disponible": false
}
```

## Casos de error esperados

- **400 (body inválido)**: enviar un `POST /libros` sin `titulo`, con
  `paginas` negativo, o sin `disponible`. Ejemplo:

  ```json
  {
    "titulo": "",
    "paginas": -5
  }
  ```

- **404 (registro inexistente)**: hacer `GET`, `PUT` o `DELETE` sobre
  `/libros/00000000-0000-0000-0000-000000000000` (un `id` que no existe en
  la tabla).

Ambos casos ya están incluidos como requests en la colección de Postman.

## Importar la colección de Postman

1. Abrir Postman → **Import**.
2. Seleccionar el archivo `postman/Lab3-Serverless-Libros.postman_collection.json`.
3. La colección trae dos carpetas: **Producción (AWS)** y **Local
   (serverless-offline)**.
4. Para producción: editar la variable de colección `baseUrl` y pegar la URL
   que entregó `serverless deploy`.
5. Para local: usar las requests de la carpeta "Local", que ya apuntan a
   `http://localhost:3000`.
6. La variable `libroId` se completa automáticamente al ejecutar "Crear
   libro" (gracias a un script de test que guarda el `id` de la respuesta).

## Cómo revisar los recursos en AWS (después del despliegue)

- **Lambda**: consola de AWS → Lambda → deben existir las 5 funciones
  (`lab3-serverless-libros-dev-crear`, `-listar`, `-obtener`, `-actualizar`,
  `-eliminar`), cada una con la variable de entorno `LIBROS_TABLE`.
- **API Gateway**: consola de AWS → API Gateway → la HTTP API debe tener las
  5 rutas configuradas.
- **DynamoDB**: consola de AWS → DynamoDB → tabla `lab3-serverless-libros-libros-dev`,
  con `id` como partition key. La opción "Explorar elementos" permite ver los
  registros creados desde Postman.
- **CloudWatch**: consola de AWS → CloudWatch → Log groups → revisar los
  logs de al menos una de las funciones para confirmar las invocaciones.

## Limpieza de recursos

```bash
serverless remove
```

> **Ejecutar únicamente después de que el docente haya realizado la revisión
> o sustentación del laboratorio.** Este comando elimina la pila de
> CloudFormation completa (Lambdas, API Gateway y la tabla DynamoDB con
> todos sus datos).
