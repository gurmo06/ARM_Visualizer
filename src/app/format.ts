import type { DirectionCounter, PredictionMode } from "../sim/prediction";

export const predictionStateLabels = {
    "one-bit": ["Last not taken", "Last taken"],
    "two-bit": ["Strong not taken", "Weak not taken", "Weak taken", "Strong taken"]
};

export function formatHex(value: bigint, digits = 16): string
{
    return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

export function formatPredictionBits(mode: PredictionMode, counter?: DirectionCounter): string
{
    if (counter === undefined || (mode !== "one-bit" && mode !== "two-bit")) return "--";
    return counter.toString(2).padStart(mode === "one-bit" ? 1 : 2, "0");
}

export function formatPredictionState(mode: PredictionMode, counter?: DirectionCounter): string
{
    if (mode === "taken") return "Always taken";
    if (mode === "taken-no-btb") return "Always taken in ID";
    if (mode === "not-taken") return "Always not taken";
    return counter === undefined ? "--" : `${counter} / ${predictionStateLabels[mode][counter]}`;
}
