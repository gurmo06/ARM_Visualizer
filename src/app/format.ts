export function formatHex(value: bigint, digits = 16): string
{
    return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}
