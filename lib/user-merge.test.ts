import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { MERGE_REFERENCES } from "./user-merge";

// A table added later that points at a user has to be moved by the merge too, or the merge would orphan it, or be
// refused by the database. This reads the schema and compares.
test("the merge moves every column that points at a user", () => {
  const fromSchema = Prisma.dmmf.datamodel.models
    .filter((model) => model.name !== "UserEmailHistory")
    .flatMap((model) =>
      model.fields
        .filter((field) => field.kind === "object" && field.type === "User" && (field.relationFromFields?.length ?? 0) > 0)
        .flatMap((field) => (field.relationFromFields ?? []).map((column) => `${model.name}.${column}`)),
    )
    .sort();
  const listed = MERGE_REFERENCES.map(([table, column]) => `${table}.${column}`).sort();
  assert.deepEqual(listed, fromSchema);
});
