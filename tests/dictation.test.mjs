import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDictation,
  speechConstructor,
  speechError,
  createDictation,
} from "../lib/dictation.ts";

class Recognition {
  starts = 0;
  stops = 0;
  aborts = 0;
  start() {
    this.starts++;
  }
  stop() {
    this.stops++;
  }
  abort() {
    this.aborts++;
  }
  result(...parts) {
    this.onresult?.({
      results: parts.map(([transcript, isFinal]) => ({
        0: { transcript },
        isFinal,
      })),
    });
  }
}
function fixture(base = "Quiero agendar", limit = 2000) {
  const recognition = new Recognition(),
    texts = [],
    interim = [],
    errors = [];
  let ends = 0;
  const session = createDictation(
    recognition,
    base,
    {
      onText: (t) => texts.push(t),
      onInterim: (t) => interim.push(t),
      onError: (e) => errors.push(e),
      onEnd: () => ends++,
    },
    limit,
  );
  return {
    recognition,
    session,
    texts,
    interim,
    errors,
    get ends() {
      return ends;
    },
  };
}

test("uses available browser recognition and preserves typed text", () => {
  assert.equal(speechConstructor({}), undefined);
  assert.equal(
    speechConstructor({ webkitSpeechRecognition: Recognition }),
    Recognition,
  );
  assert.equal(
    appendDictation("Quiero agendar  ", " a Nicky mañana "),
    "Quiero agendar a Nicky mañana",
  );
  assert.equal(appendDictation("", " Hola "), "Hola");
});
test("interim words remain separate; repeated cumulative results do not duplicate text", () => {
  const f = fixture();
  f.session.start();
  assert.equal(f.recognition.lang, "es-MX");
  assert.equal(f.recognition.continuous, false);
  f.recognition.result(["a Nicky", false]);
  assert.equal(f.texts.at(-1), "Quiero agendar");
  assert.equal(f.interim.at(-1), "a Nicky");
  f.recognition.result(["a Nicky", true], ["mañana", false]);
  f.recognition.result(["a Nicky", true], ["mañana", true]);
  f.recognition.result(["a Nicky", true], ["mañana", true]);
  assert.equal(f.texts.at(-1), "Quiero agendar a Nicky mañana");
  f.recognition.onend();
  assert.equal(f.ends, 1);
});
test("stop waits for the final transcript; cancel rejects late events", () => {
  const f = fixture();
  f.session.start();
  f.session.stop();
  assert.equal(f.recognition.stops, 1);
  f.recognition.result(["a Canela", true]);
  assert.equal(f.texts.at(-1), "Quiero agendar a Canela");
  const late = f.recognition.onresult;
  f.session.cancel();
  late({ results: [{ 0: { transcript: "texto tardío" }, isFinal: true }] });
  assert.equal(f.texts.at(-1), "Quiero agendar a Canela");
  assert.equal(f.recognition.aborts, 1);
  assert.equal(f.recognition.onresult, null);
});
test("denied permission ends once, reports guidance and never restarts", () => {
  const f = fixture();
  f.session.start();
  const lateEnd = f.recognition.onend;
  f.recognition.onerror({ error: "not-allowed" });
  lateEnd();
  assert.equal(f.ends, 1);
  assert.equal(f.recognition.starts, 1);
  assert.match(f.errors[0], /Permite el micrófono/);
  assert.equal(f.recognition.onend, null);
});
test("limits text and stops listening when the message is full", () => {
  const f = fixture("Hola", 12);
  f.session.start();
  f.recognition.result(["agendar mañana", true]);
  assert.equal(f.texts.at(-1).length, 12);
  assert.equal(f.recognition.stops, 1);
  f.session.cancel();
});
test("start failures and unavailable audio preserve the draft", () => {
  const f = fixture();
  f.recognition.start = () => {
    throw Error("busy");
  };
  f.session.start();
  assert.equal(f.ends, 1);
  assert.equal(f.texts.length, 0);
  assert.match(f.errors[0], /No se pudo iniciar/);
  assert.match(speechError("audio-capture"), /otra llamada/);
  assert.match(speechError("network"), /conexión/);
});
