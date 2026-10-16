import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, mutateState, validateClient } from "../lib/operations.ts";

test("a client with an unknown pet species can be imported and edited without guessing it", () => {
  const client = structuredClone(demoState().clients[0]);
  client.pets[0].species = "Por confirmar";
  client.phone = "";
  client.notes =
    "Fuente: ficha original. Confirmar especie antes del servicio.";
  assert.deepEqual(validateClient(client), client);
  const saved = mutateState(
    demoState(),
    { type: "saveClient", client },
    "Administración",
  );
  assert.equal(
    saved.clients.find((c) => c.id === client.id).pets[0].species,
    "Por confirmar",
  );
  assert.equal(saved.clients.find((c) => c.id === client.id).phone, "");
  client.pets[0].species = "valor inválido";
  assert.throws(() => validateClient(client), /especie/);
});
