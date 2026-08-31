import { describe, it, expect } from "vitest";
import { serializePlan, parseSharedPlan, SHARE_VERSION } from "../src/domain/plan-share.js";

const fullPlan = {
  id: "abc123",
  source: "custom",
  active: true,
  createdAt: { seconds: 1 },
  name: "Push Pull Legs",
  notes: ["Descanso: 1 a 1min30 entre as séries.", "Hidratar bem durante o treino"],
  days: [
    {
      type: "A",
      label: "Push",
      order: 3,
      exercises: [
        {
          name: "Supino reto",
          muscle: "peito",
          reps: [10, 10, 8],
          badges: ["falha"],
          grip: "pronada",
          note: "cadência lenta",
          fromSug: true,
          superset: { name: "Crucifixo", muscle: "peito", reps: [12, 12], badges: [], grip: "supinada", note: null },
        },
        { name: "Desenvolvimento", muscle: "ombro", reps: [8, 8, 8], badges: [], note: null, superset: null },
      ],
    },
  ],
};

describe("serializePlan", () => {
  it("whitelists only the shareable fields and drops the rest", () => {
    const out = serializePlan(fullPlan);
    expect(out).toEqual({
      v: 1,
      name: "Push Pull Legs",
      notes: ["Descanso: 1 a 1min30 entre as séries.", "Hidratar bem durante o treino"],
      days: [
        {
          type: "A",
          label: "Push",
          exercises: [
            {
              name: "Supino reto",
              muscle: "peito",
              reps: [10, 10, 8],
              badges: ["falha"],
              grip: "pronada",
              note: "cadência lenta",
              superset: { name: "Crucifixo", muscle: "peito", reps: [12, 12], badges: [], grip: "supinada", note: null, superset: null },
            },
            { name: "Desenvolvimento", muscle: "ombro", reps: [8, 8, 8], badges: [], grip: null, note: null, superset: null },
          ],
        },
      ],
    });
    expect(out.id).toBeUndefined();
    expect(out.source).toBeUndefined();
    expect(out.days[0].order).toBeUndefined();
    expect(out.days[0].exercises[0].fromSug).toBeUndefined();
  });
});

describe("parseSharedPlan", () => {
  it("round-trips a serialized plan", () => {
    const serialized = serializePlan(fullPlan);
    const parsed = parseSharedPlan(serialized);
    expect(parsed).toEqual(serialized);
  });

  it("round-trips through JSON (as it travels through the URL codec)", () => {
    const serialized = serializePlan(fullPlan);
    const parsed = parseSharedPlan(JSON.parse(JSON.stringify(serialized)));
    expect(parsed).toEqual(serialized);
  });

  it("rejects a missing or wrong version", () => {
    const serialized = serializePlan(fullPlan);
    expect(parseSharedPlan({ ...serialized, v: undefined })).toBeNull();
    expect(parseSharedPlan({ ...serialized, v: 2 })).toBeNull();
    expect(parseSharedPlan({ ...serialized, v: "1" })).toBeNull();
  });

  it("rejects non-object / null / array input", () => {
    expect(parseSharedPlan(null)).toBeNull();
    expect(parseSharedPlan(undefined)).toBeNull();
    expect(parseSharedPlan("not an object")).toBeNull();
    expect(parseSharedPlan(42)).toBeNull();
  });

  it("rejects a non-string or empty name", () => {
    const serialized = serializePlan(fullPlan);
    expect(parseSharedPlan({ ...serialized, name: 123 })).toBeNull();
    expect(parseSharedPlan({ ...serialized, name: "" })).toBeNull();
    expect(parseSharedPlan({ ...serialized, name: "   " })).toBeNull();
  });

  it("caps an oversized name instead of rejecting", () => {
    const serialized = serializePlan(fullPlan);
    const huge = "x".repeat(500);
    const parsed = parseSharedPlan({ ...serialized, name: huge });
    expect(parsed.name.length).toBeLessThanOrEqual(80);
  });

  it("rejects when days is missing, not an array, empty, or oversized", () => {
    const serialized = serializePlan(fullPlan);
    expect(parseSharedPlan({ ...serialized, days: undefined })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: "nope" })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: Array(11).fill(serialized.days[0]) })).toBeNull();
  });

  it("rejects a day with a non-string type or missing exercises", () => {
    const serialized = serializePlan(fullPlan);
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], type: 5 }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], type: "" }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [] }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: "nope" }] })).toBeNull();
  });

  it("rejects an oversized exercises array within a day", () => {
    const serialized = serializePlan(fullPlan);
    const ex = serialized.days[0].exercises[0];
    const day = { ...serialized.days[0], exercises: Array(31).fill(ex) };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
  });

  it("rejects an exercise with a non-string or empty name", () => {
    const serialized = serializePlan(fullPlan);
    const day = { ...serialized.days[0], exercises: [{ ...serialized.days[0].exercises[0], name: 5 }] };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
    const day2 = { ...serialized.days[0], exercises: [{ ...serialized.days[0].exercises[0], name: "" }] };
    expect(parseSharedPlan({ ...serialized, days: [day2] })).toBeNull();
  });

  it("rejects a non-array reps, empty reps, or non-numeric rep entries", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];
    let day = { ...serialized.days[0], exercises: [{ ...base, reps: "10,10,10" }] };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
    day = { ...serialized.days[0], exercises: [{ ...base, reps: [] }] };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
    day = { ...serialized.days[0], exercises: [{ ...base, reps: [10, "8", 10] }] };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
  });

  it("rejects a reps array longer than the cap", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];
    const day = { ...serialized.days[0], exercises: [{ ...base, reps: Array(13).fill(5) }] };
    expect(parseSharedPlan({ ...serialized, days: [day] })).toBeNull();
  });

  it("clamps negative/zero/fractional reps within an allowed-length array", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];
    const day = { ...serialized.days[0], exercises: [{ ...base, reps: [-3, 0, 2.7] }] };
    const parsed = parseSharedPlan({ ...serialized, days: [day] });
    expect(parsed.days[0].exercises[0].reps).toEqual([1, 1, 3]);
  });

  it("rejects malformed badges, note, or superset", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [{ ...base, badges: "not-array" }] }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [{ ...base, badges: [1, 2] }] }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [{ ...base, note: 42 }] }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [{ ...base, superset: "nope" }] }] })).toBeNull();
    expect(parseSharedPlan({ ...serialized, days: [{ ...serialized.days[0], exercises: [{ ...base, superset: { name: "" } }] }] })).toBeNull();
  });

  it("keeps a valid grip, coerces an invalid or wrong-typed one to null, and defaults a missing one to null", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];

    const parsed = parseSharedPlan(serialized);
    expect(parsed.days[0].exercises[0].grip).toBe("pronada");
    expect(parsed.days[0].exercises[0].superset.grip).toBe("supinada");

    const dayInvalid = { ...serialized.days[0], exercises: [{ ...base, grip: "canhoto" }] };
    const parsedInvalid = parseSharedPlan({ ...serialized, days: [dayInvalid] });
    expect(parsedInvalid).not.toBeNull();
    expect(parsedInvalid.days[0].exercises[0].grip).toBeNull();

    const dayWrongType = { ...serialized.days[0], exercises: [{ ...base, grip: 123 }] };
    expect(parseSharedPlan({ ...serialized, days: [dayWrongType] }).days[0].exercises[0].grip).toBeNull();

    const dayMissing = { ...serialized.days[0], exercises: [{ ...base, grip: undefined }] };
    expect(parseSharedPlan({ ...serialized, days: [dayMissing] }).days[0].exercises[0].grip).toBeNull();
  });

  it("round-trips a 'peak' badge like any other free-string badge (no closed-set assumption)", () => {
    const serialized = serializePlan(fullPlan);
    const base = serialized.days[0].exercises[0];
    const day = { ...serialized.days[0], exercises: [{ ...base, badges: ["peak", "drop"] }] };
    const parsed = parseSharedPlan({ ...serialized, days: [day] });
    expect(parsed.days[0].exercises[0].badges).toEqual(["peak", "drop"]);
  });

  it("round-trips valid notes, defaults a non-array to [], and drops bad entries instead of rejecting the plan", () => {
    const serialized = serializePlan(fullPlan);
    expect(serialized.notes).toEqual(["Descanso: 1 a 1min30 entre as séries.", "Hidratar bem durante o treino"]);

    const parsed = parseSharedPlan(serialized);
    expect(parsed.notes).toEqual(["Descanso: 1 a 1min30 entre as séries.", "Hidratar bem durante o treino"]);

    expect(parseSharedPlan({ ...serialized, notes: "not-an-array" }).notes).toEqual([]);
    expect(parseSharedPlan({ ...serialized, notes: undefined }).notes).toEqual([]);
    expect(parseSharedPlan({ ...serialized, notes: null }).notes).toEqual([]);

    // non-string / empty entries are dropped, not rejected
    const mixed = parseSharedPlan({ ...serialized, notes: ["ok", 42, "", "   ", null, "also ok"] });
    expect(mixed).not.toBeNull();
    expect(mixed.notes).toEqual(["ok", "also ok"]);

    // oversized count is capped, not rejected
    const many = parseSharedPlan({ ...serialized, notes: Array(25).fill("n") });
    expect(many.notes.length).toBe(20);

    // oversized individual line is capped, not rejected
    const huge = parseSharedPlan({ ...serialized, notes: ["x".repeat(500)] });
    expect(huge.notes[0].length).toBeLessThanOrEqual(200);
  });

  it("ignores injected extra/unknown fields instead of leaking them through", () => {
    const injected = {
      v: SHARE_VERSION,
      name: "Test",
      days: [
        {
          type: "A",
          label: "Day",
          extraField: "should be dropped",
          exercises: [
            { name: "Ex1", reps: [10], extraField: "should be dropped" },
          ],
        },
      ],
    };
    const parsed = parseSharedPlan(injected);
    expect(parsed).toEqual({
      v: 1,
      name: "Test",
      notes: [],
      days: [
        {
          type: "A",
          label: "Day",
          exercises: [
            { name: "Ex1", muscle: null, reps: [10], badges: [], grip: null, note: null, superset: null },
          ],
        },
      ],
    });
    expect(parsed.days[0].extraField).toBeUndefined();
    expect(parsed.days[0].exercises[0].extraField).toBeUndefined();
  });
});
