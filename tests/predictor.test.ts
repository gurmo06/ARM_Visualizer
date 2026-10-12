import { describe, expect, it } from "vitest";
import { BranchPredictor } from "../src/perf/predictor";

describe("tagged two-bit branch predictor", () =>
{
    it("starts cold, indexes instruction addresses, and trains saturating counters", () =>
    {
        const predictor = new BranchPredictor();
        expect(predictor.predict(12n)).toMatchObject({ index: 3, btbHit: false, taken: false, nextPc: 16n });
        const outcomes = [false, false, true, true, true, true, false, false, false, false];
        const counters = [0, 0, 1, 2, 3, 3, 2, 1, 0, 0];
        outcomes.forEach((taken, i) =>
        {
            predictor.resolve(12n, 0n, true, taken, predictor.predict(12n));
            expect(predictor.predict(12n)).toMatchObject({
                btbHit: true, target: 0n, counter: counters[i],
                taken: counters[i] >= 2, nextPc: counters[i] >= 2 ? 0n : 16n
            });
        });
        expect(predictor.snapshot()).toMatchObject({ resolved: 10, btbHits: 9, btbMisses: 1 });
    });

    it("allocates weak-not-taken then trains, retaining taken bias after a single reversal", () =>
    {
        const predictor = new BranchPredictor();
        for (const taken of [true, true, false]) predictor.resolve(0n, 32n, true, taken, predictor.predict(0n));
        expect(predictor.predict(0n)).toMatchObject({ taken: true, counter: 2 });
        predictor.resolve(0n, 32n, true, false, predictor.predict(0n));
        expect(predictor.predict(0n)).toMatchObject({ taken: false, counter: 1 });
    });

    it("predicts unconditional branches only after learning their target", () =>
    {
        const predictor = new BranchPredictor();
        const cold = predictor.predict(0n);
        expect(predictor.resolve(0n, 48n, false, true, cold)).toEqual({ nextPc: 48n, mispredicted: true });
        expect(predictor.predict(0n)).toMatchObject({ taken: true, nextPc: 48n, btbHit: true, counter: undefined });
        expect(cold).toMatchObject({ btbHit: false, nextPc: 4n });
        expect(predictor.resolve(0n, 48n, false, true, predictor.predict(0n)).mispredicted).toBe(false);
        expect(predictor.snapshot()).toMatchObject({ resolved: 2, correct: 1, mispredictions: 1 });
    });

    it("checks full PC tags and replaces colliding entries", () =>
    {
        const predictor = new BranchPredictor({ entries: 4 });
        predictor.resolve(0n, 8n, false, true, predictor.predict(0n));
        for (const pc of [16n, 0x1_0000_0000n])
        {
            expect(predictor.predict(pc)).toMatchObject({ index: 0, btbHit: false, nextPc: pc + 4n });
            predictor.resolve(pc, pc + 8n, false, true, predictor.predict(pc));
            expect(predictor.predict(0n).btbHit).toBe(false);
            expect(predictor.snapshot().entries).toHaveLength(1);
        }
    });

    it("compares next PCs, including target changes and fallthrough-equivalent branches", () =>
    {
        const predictor = new BranchPredictor();
        expect(predictor.resolve(0n, 4n, true, true, predictor.predict(0n)).mispredicted).toBe(false);
        expect(predictor.resolve(0n, 4n, true, false, predictor.predict(0n)).mispredicted).toBe(false);
        predictor.resolve(8n, 16n, false, true, predictor.predict(8n));
        expect(predictor.resolve(8n, 32n, false, true, predictor.predict(8n)).mispredicted).toBe(true);
        expect(predictor.predict(8n).nextPc).toBe(32n);
        expect(predictor.predict(0xFFFF_FFFF_FFFF_FFFCn).nextPc).toBe(0n);
    });

    it("keeps static prediction disabled but counts resolved outcomes", () =>
    {
        const predictor = new BranchPredictor({ mode: "not-taken" });
        for (const taken of [true, false, true]) predictor.resolve(0n, 32n, true, taken, predictor.predict(0n));
        expect(predictor.predict(0n)).toMatchObject({ btbHit: false, taken: false, nextPc: 4n });
        expect(predictor.snapshot()).toMatchObject({ entries: [], resolved: 3, correct: 1, mispredictions: 2, btbHits: 0, btbMisses: 0 });
    });

    it("isolates snapshots and resets all learning and statistics", () =>
    {
        const predictor = new BranchPredictor({ entries: 8 });
        const initial = predictor.snapshot();
        predictor.resolve(0n, 32n, true, true, predictor.predict(0n));
        const snapshot = predictor.snapshot();
        snapshot.entries[0].target = 99n;
        expect(predictor.predict(0n).target).toBe(32n);
        predictor.reset();
        expect(predictor.snapshot()).toEqual(initial);
        expect(snapshot.resolved).toBe(1);
    });

    it.each([0, -1, 3, 1.5, 8192, NaN, Infinity])("rejects invalid capacity %s", (entries) =>
    {
        expect(() => new BranchPredictor({ entries })).toThrow("power of two");
    });
});
