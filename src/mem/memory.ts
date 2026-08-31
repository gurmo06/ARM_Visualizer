import type { DataSize, MemoryCell, Word } from "../sim/types";

export class Memory
{
    private bytes = new Map<string, number>();

    load(address: Word, size: DataSize, signed = false): Word
    {
        this.assertAligned(address, size);

        const byteCount = size / 8;
        let value = 0n;

        for (let i = 0; i < byteCount; i += 1)
        {
            value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8);
        }

        if (!signed)
        {
            return value;
        }

        const signBit = 1n << BigInt(size - 1);
        return (value & signBit) === 0n ? value : value - (1n << BigInt(size));
    }

    store(address: Word, size: DataSize, value: Word): void
    {
        this.assertAligned(address, size);

        const byteCount = size / 8;

        for (let i = 0; i < byteCount; i += 1)
        {
            const next = Number((value >> BigInt(i * 8)) & 0xFFn);
            this.bytes.set((address + BigInt(i)).toString(), next);
        }
    }

    snapshot(): readonly MemoryCell[]
    {
        return Array.from(this.bytes.entries())
            .map(([address, value]) => ({ address: BigInt(address), value }))
            .sort((a, b) => a.address < b.address ? -1 : 1);
    }

    reset(): void
    {
        this.bytes.clear();
    }

    private readByte(address: Word): number
    {
        return this.bytes.get(address.toString()) ?? 0;
    }

    private assertAligned(address: Word, size: DataSize): void
    {
        const alignment = BigInt(size / 8);

        if ((address % alignment) !== 0n)
        {
            throw new Error(`Unaligned ${size}-bit memory access at 0x${address.toString(16)}.`);
        }
    }
}
