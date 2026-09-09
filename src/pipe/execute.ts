import { ALU } from "../core/alu";
import { applyWidth, shift } from "../core/shifter";
import { materializeImmediate } from "../decode/immgen";
import type { OperandSlot, PipelineToken } from "../sim/pipeline";
import type { ALUOpcode } from "../sim/types";
import { resolveBranch } from "./branch_unit";
import { destination } from "./operands";

const alu = new ALU();

export function executeToken(token: PipelineToken): void
{
    const instruction = token.instruction;
    if (!instruction || token.fault) return;
    const read = (slot: OperandSlot) => token.operands.find((operand) => operand.slot === slot)?.value ?? 0n;
    const immediate = instruction.immediate ? materializeImmediate(instruction.immediate) : 0n;
    const shifted = instruction.shift
        ? shift(read("rm"), instruction.shift.shiftKind, instruction.shift.amount, instruction.width)
        : read("rm");
    token.destination = destination(instruction);

    switch (instruction.opcode)
    {
        case "ADD": case "ADDS": case "SUB": case "SUBS": case "CMP":
        case "AND": case "ORR": case "EOR":
        {
            const op: ALUOpcode = instruction.opcode === "ADDS" ? "ADD"
                : instruction.opcode === "SUBS" || instruction.opcode === "CMP" ? "SUB"
                : instruction.opcode;
            token.aluA = read("rn");
            token.aluB = instruction.immediate ? immediate : shifted;
            const { value, ...flags } = alu.alu_exec({
                op, a: token.aluA, b: token.aluB, width: instruction.width
            });
            token.result = value;
            if (instruction.writesFlags) token.flags = flags;
            break;
        }
        case "MOVZ": case "MOVK":
            token.aluA = read("rd");
            token.aluB = immediate;
            token.result = applyWidth(instruction.opcode === "MOVZ" ? immediate
                : (read("rd") & ~(0xFFFFn << BigInt(instruction.immediate?.shift ?? 0))) | immediate,
            instruction.width);
            break;
        case "LSL": case "LSR": case "ASR":
            token.aluA = read("rn");
            token.aluB = immediate;
            token.result = shift(read("rn"), instruction.opcode, Number(immediate), instruction.width);
            break;
        case "LDR": case "STR":
        {
            const memory = instruction.memory;
            if (!memory) throw new Error("Missing memory operand.");
            if (memory.writeback !== "none") throw new Error("Indexed writeback is not supported by this pipeline.");
            token.aluA = read("base");
            token.aluB = memory.offset.value;
            token.memoryAddress = applyWidth(token.aluA + token.aluB, 64);
            if (memory.base.role === "stack-pointer" && read("base") % 16n !== 0n)
            {
                throw new Error("SP not 16-byte aligned for memory access.");
            }
            if (instruction.opcode === "STR") token.storeValue = read("rd");
            break;
        }
        case "B": case "CBZ": case "CBNZ":
        {
            const branch = resolveBranch(instruction, read("rn"));
            token.branchTaken = branch.taken;
            token.branchTarget = branch.target;
            break;
        }
        case "NOP": case "HLT":
            break;
        default:
            throw new Error(`Unsupported instruction: ${instruction.opcode}.`);
    }
}
