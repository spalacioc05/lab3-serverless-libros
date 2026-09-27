const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const TABLE = process.env.LIBROS_TABLE;

// Cliente creado fuera de los handlers para reutilizar conexiones entre invocaciones.
const client = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(client);

const respuesta = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const leerBody = (event) => {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
};

const validarLibro = (data) => {
  if (!data) return "El cuerpo debe ser un JSON válido";
  if (typeof data.titulo !== "string" || !data.titulo.trim())
    return '"titulo" es obligatorio y debe ser texto no vacío';
  if (typeof data.autor !== "string" || !data.autor.trim())
    return '"autor" es obligatorio y debe ser texto no vacío';
  if (typeof data.genero !== "string" || !data.genero.trim())
    return '"genero" es obligatorio y debe ser texto no vacío';
  if (!Number.isInteger(data.paginas) || data.paginas <= 0)
    return '"paginas" es obligatorio y debe ser un entero mayor que 0';
  if (typeof data.disponible !== "boolean")
    return '"disponible" es obligatorio y debe ser booleano';
  return null;
};

// CREATE - POST /libros
module.exports.crear = async (event) => {
  const data = leerBody(event);
  const error = validarLibro(data);
  if (error) return respuesta(400, { error });

  const item = {
    id: randomUUID(),
    titulo: data.titulo,
    autor: data.autor,
    genero: data.genero,
    paginas: data.paginas,
    disponible: data.disponible,
    creadoEn: new Date().toISOString(),
  };

  try {
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    return respuesta(201, item);
  } catch (err) {
    console.error(err);
    return respuesta(500, { error: "No fue posible crear el libro" });
  }
};

// READ (todos) - GET /libros
module.exports.listar = async () => {
  try {
    const { Items } = await db.send(new ScanCommand({ TableName: TABLE }));
    return respuesta(200, Items);
  } catch (err) {
    console.error(err);
    return respuesta(500, { error: "No fue posible listar los libros" });
  }
};

// READ (uno) - GET /libros/{id}
module.exports.obtener = async (event) => {
  const { id } = event.pathParameters;

  try {
    const { Item } = await db.send(
      new GetCommand({ TableName: TABLE, Key: { id } })
    );
    if (!Item) return respuesta(404, { error: "Libro no encontrado" });
    return respuesta(200, Item);
  } catch (err) {
    console.error(err);
    return respuesta(500, { error: "No fue posible consultar el libro" });
  }
};

// UPDATE - PUT /libros/{id}
module.exports.actualizar = async (event) => {
  const { id } = event.pathParameters;
  const data = leerBody(event);
  const error = validarLibro(data);
  if (error) return respuesta(400, { error });

  try {
    const { Attributes } = await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
        UpdateExpression:
          "SET titulo = :titulo, autor = :autor, genero = :genero, paginas = :paginas, disponible = :disponible",
        ExpressionAttributeValues: {
          ":titulo": data.titulo,
          ":autor": data.autor,
          ":genero": data.genero,
          ":paginas": data.paginas,
          ":disponible": data.disponible,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return respuesta(200, Attributes);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return respuesta(404, { error: "Libro no encontrado" });
    }
    console.error(err);
    return respuesta(500, { error: "No fue posible actualizar el libro" });
  }
};

// DELETE - DELETE /libros/{id}
module.exports.eliminar = async (event) => {
  const { id } = event.pathParameters;

  try {
    await db.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
      })
    );
    return respuesta(200, { mensaje: "Libro eliminado correctamente" });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return respuesta(404, { error: "Libro no encontrado" });
    }
    console.error(err);
    return respuesta(500, { error: "No fue posible eliminar el libro" });
  }
};
