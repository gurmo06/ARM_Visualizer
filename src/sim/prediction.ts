import type { Word } from "./types";

export type PredictionMode = "two-bit" | "not-taken";
export type DirectionCounter = 0 | 1 | 2 | 3;

export interface PredictorOptions
{
    mode?: PredictionMode;
    entries?: number;
}

export interface BranchPrediction
{
    mode: PredictionMode;
    index: number;
    btbHit: boolean;
    taken: boolean;
    nextPc: Word;
    target?: Word;
    counter?: DirectionCounter;
}

export interface BranchResolution
{
    nextPc: Word;
    mispredicted: boolean;
}

export interface PredictorEntry
{
    index: number;
    pc: Word;
    target: Word;
    conditional: boolean;
    counter: DirectionCounter;
}

export interface PredictorSnapshot
{
    mode: PredictionMode;
    capacity: number;
    entries: PredictorEntry[];
    resolved: number;
    correct: number;
    mispredictions: number;
    btbHits: number;
    btbMisses: number;
}
