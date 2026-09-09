import { applyWidth } from "../core/shifter";
import type { OperandSlot, OperandValue } from "../sim/pipeline";
import type { Instruction, RegisterOperand, Word } from "../sim/types";

export function sameRegister(a: RegisterOperand, b: RegisterOperand): boolean
{
    return a.role !== "zero-register" && b.role !== "zero-register"
        && a.role === b.role && a.encoded === b.encoded;
}

export function registerName(operand: RegisterOperand): string
{
    if (operand.role === "stack-pointer") return operand.width === 64 ? "SP" : "WSP";
    const prefix = operand.width === 64 ? "X" : "W";
    return operand.role === "zero-register" ? `${prefix}ZR` : `${prefix}${operand.encoded}`;
}

export function sources(instruction: Instruction): { slot: OperandSlot; register: RegisterOperand }[]
{
    const result: { slot: OperandSlot; register: RegisterOperand }[] = [];
    if (instruction.rn) result.push({ slot: "rn", register: instruction.rn });
    if (instruction.rm) result.push({ slot: "rm", register: instruction.rm });
    if (instruction.memory) result.push({ slot: "base", register: instruction.memory.base });
    if ((instruction.opcode === "MOVK" || instruction.opcode === "STR") && instruction.rd)
    {
        result.push({ slot: "rd", register: instruction.rd });
    }
    return result;
}

export function destination(instruction: Instruction): RegisterOperand | undefined
{
    return instruction.opcode !== "STR" && instruction.rd?.role !== "zero-register"
        ? instruction.rd : undefined;
}

export function readOperands(instruction: Instruction, registers: Word[], sp: Word): OperandValue[]
{
    return sources(instruction).map(({ slot, register }) => ({
        slot, register,
        value: applyWidth(register.role === "zero-register" ? 0n
            : register.role === "stack-pointer" ? sp : registers[register.encoded], register.width),
        source: register.role === "zero-register" ? "zero-register" : "register-file"
    }));
}
