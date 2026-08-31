import type { RegisterWidth, ShiftKind, Word } from "../sim/types";

export function maskForWidth(width: RegisterWidth): Word
{
    return width === 64 ? 0xFFFF_FFFF_FFFF_FFFFn : 0xFFFF_FFFFn;
}

export function signBitForWidth(width: RegisterWidth): Word
{
    return width === 64 ? 1n << 63n : 1n << 31n;
}

export function applyWidth(value: Word, width: RegisterWidth): Word
{
    return value & maskForWidth(width);
}

export function shift(value: Word, kind: ShiftKind, amount: number, width: RegisterWidth): Word
{
    const masked = applyWidth(value, width);
    const boundedAmount = BigInt(Math.max(0, Math.min(amount, width)));

    switch (kind)
    {
        case "LSL":
            return applyWidth(masked << boundedAmount, width);
        case "LSR":
            return applyWidth(masked >> boundedAmount, width);
        case "ASR":
        {
            if (boundedAmount === 0n)
            {
                return masked;
            }

            const signBit = signBitForWidth(width);
            const signed = (masked & signBit) === 0n
                ? masked
                : masked - (1n << BigInt(width));

            return applyWidth(signed >> boundedAmount, width);
        }
    }
}
