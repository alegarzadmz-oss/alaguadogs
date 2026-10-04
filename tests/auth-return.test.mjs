import { test } from "node:test";
import assert from "node:assert/strict";
import { returnPath } from "../lib/return-path.ts";
test("sign-in retains a private invitation on the portal after authentication", () => {
  const token = "a".repeat(64);
  assert.equal(returnPath("/#equipo=" + token), "/#equipo=" + token);
});
test("sign-in redirects cannot send the user or invitation to another host", () => {
  for (const path of [
    "https://other.example/",
    "//other.example/",
    "/\\other.example/",
    "/sign-in",
    "/sign-out",
    "/sign-up/again",
    undefined,
  ])
    assert.equal(returnPath(path), "/");
});
