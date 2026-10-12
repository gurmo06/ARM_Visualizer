import { applyWidth } from "../core/shifter";
import type {
    BranchPrediction, BranchResolution, DirectionCounter, PredictorEntry,
    PredictorOptions, PredictorSnapshot
} from "../sim/prediction";
import type { Word } from "../sim/types";

export class BranchPredictor
{
    private readonly mode;
    private readonly capacity;
    private table: (PredictorEntry | undefined)[] = [];
    private resolved = 0;
    private correct = 0;
    private btbHits = 0;
    private btbMisses = 0;

    constructor({ mode = "two-bit", entries = 64 }: PredictorOptions = {})
    {
        if (mode !== "two-bit" && mode !== "not-taken") throw new Error("Invalid prediction mode.");
        if (!Number.isSafeInteger(entries) || entries < 1 || entries > 4096 || (entries & (entries - 1)) !== 0)
        {
            throw new Error("Predictor entries must be a power of two between 1 and 4096.");
        }
        this.mode = mode;
        this.capacity = entries;
        this.reset();
    }

    public reset(): void
    {
        this.table = Array.from({ length: this.capacity });
        this.resolved = this.correct = this.btbHits = this.btbMisses = 0;
    }

    public predict(pc: Word): BranchPrediction
    {
        const index = this.index(pc);
        const entry = this.mode === "two-bit" ? this.table[index] : undefined;
        const hit = entry?.pc === pc;
        const taken = hit && (!entry.conditional || entry.counter >= 2);
        return {
            mode: this.mode, index, btbHit: hit, taken,
            nextPc: taken ? entry.target : applyWidth(pc + 4n, 64),
            target: hit ? entry.target : undefined,
            counter: hit && entry.conditional ? entry.counter : undefined
        };
    }

    // Called at the clock edge after IF has read the old table. Only resolved branches train it.
    public resolve(pc: Word, target: Word, conditional: boolean, taken: boolean,
        prediction: BranchPrediction): BranchResolution
    {
        const nextPc = applyWidth(taken ? target : pc + 4n, 64);
        const mispredicted = prediction.nextPc !== nextPc;
        this.resolved += 1;
        if (!mispredicted) this.correct += 1;

        if (this.mode === "two-bit")
        {
            if (prediction.btbHit) this.btbHits += 1;
            else this.btbMisses += 1;
            const index = this.index(pc);
            const previous = this.table[index];
            const counter = previous?.pc === pc && previous.conditional === conditional ? previous.counter : 1;
            this.table[index] = {
                index, pc, target: applyWidth(target, 64), conditional,
                counter: conditional ? Math.max(0, Math.min(3, counter + (taken ? 1 : -1))) as DirectionCounter : 3
            };
        }
        return { nextPc, mispredicted };
    }

    public snapshot(): PredictorSnapshot
    {
        return {
            mode: this.mode, capacity: this.capacity,
            entries: this.table.flatMap((entry) => entry ? [{ ...entry }] : []),
            resolved: this.resolved, correct: this.correct,
            mispredictions: this.resolved - this.correct,
            btbHits: this.btbHits, btbMisses: this.btbMisses
        };
    }

    private index(pc: Word): number
    {
        return Number((pc >> 2n) & BigInt(this.capacity - 1));
    }
}
