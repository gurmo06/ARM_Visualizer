import type { MemoryOperand, Word } from "../sim/types";
import type { Memory } from "./memory";

export class LoadStoreUnit
{
    load(memory: Memory, operand: MemoryOperand, baseValue: Word): Word
    {
        const address = this.effectiveAddress(operand, baseValue);
        return memory.load(address, operand.accessSize, operand.signed);
    }

    store(memory: Memory, operand: MemoryOperand, baseValue: Word, value: Word): void
    {
        const address = this.effectiveAddress(operand, baseValue);
        memory.store(address, operand.accessSize, value);
    }

    effectiveAddress(operand: MemoryOperand, baseValue: Word): Word
    {
        if (operand.writeback === "post-index")
        {
            return baseValue;
        }

        return baseValue + operand.offset.value;
    }

    writebackAddress(operand: MemoryOperand, baseValue: Word): Word | undefined
    {
        if (operand.writeback === "none")
        {
            return undefined;
        }

        return baseValue + operand.offset.value;
    }
}
