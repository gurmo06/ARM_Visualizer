import type {
    DataSize,
    ImmediateOperand,
    Instruction,
    MemoryOperand,
    Opcode,
    RegisterOperand,
    RegisterWidth,
    ShiftKind,
    Word
} from "../sim/types";

const REGISTER_PATTERN = /^(X|W)([0-9]+|ZR|SP)$/i;

export function decodeAssembly(source: string): Instruction[]
{
    return source
        .split(/\r?\n/)
        .map(stripComment)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => decodeLine(line, BigInt(index * 4), index));
}

export function decodeLine(sourceText: string, address: Word, index = Number(address / 4n)): Instruction
{
    const [mnemonicPart, operandText = ""] = splitMnemonic(sourceText);
    const opcode = mnemonicPart.toUpperCase() as Opcode;
    const operands = splitOperands(operandText);

    switch (opcode)
    {
        case "ADD":
        case "SUB":
        case "ADDS":
        case "SUBS":
        {
            const rd = parseRegister(operands[0], "destination");
            const rn = parseRegister(operands[1], "add-sub");
            const width = rd.width;

            if (operands[2]?.startsWith("#"))
            {
                const immediate = parseImmediate(operands[2], width, 0);
                const shift = operands[3] ? parseAddSubImmediateShift(operands[3]) : undefined;

                if (shift !== undefined)
                {
                    immediate.shift = shift;
                }

                return {
                    id: String(index),
                    address,
                    opcode,
                    format: "data-processing-immediate",
                    width,
                    rd,
                    rn,
                    immediate,
                    operands: [rd, rn, immediate],
                    writesFlags: opcode === "ADDS" || opcode === "SUBS",
                    sourceText
                };
            }

            const rm = parseRegister(operands[2], "general");
            const shift = operands[3] ? parseShift(operands[3]) : undefined;

            return {
                id: String(index),
                address,
                opcode,
                format: "data-processing-register",
                width,
                rd,
                rn,
                rm,
                shift,
                operands: shift ? [rd, rn, rm, shift] : [rd, rn, rm],
                writesFlags: opcode === "ADDS" || opcode === "SUBS",
                sourceText
            };
        }
        case "CMP":
        {
            const rn = parseRegister(operands[0], "add-sub");
            const width = rn.width;

            if (operands[1]?.startsWith("#"))
            {
                const immediate = parseImmediate(operands[1], width, 0);

                return {
                    id: String(index),
                    address,
                    opcode,
                    format: "data-processing-immediate",
                    width,
                    rn,
                    immediate,
                    operands: [rn, immediate],
                    writesFlags: true,
                    sourceText
                };
            }

            const rm = parseRegister(operands[1], "general");

            return {
                id: String(index),
                address,
                opcode,
                format: "data-processing-register",
                width,
                rn,
                rm,
                operands: [rn, rm],
                writesFlags: true,
                sourceText
            };
        }
        case "AND":
        case "ORR":
        case "EOR":
        {
            const rd = parseRegister(operands[0], "destination");
            const rn = parseRegister(operands[1], "general");
            const rm = parseRegister(operands[2], "general");
            const width = rd.width;
            const shift = operands[3] ? parseShift(operands[3]) : undefined;

            return {
                id: String(index),
                address,
                opcode,
                format: "data-processing-register",
                width,
                rd,
                rn,
                rm,
                shift,
                operands: shift ? [rd, rn, rm, shift] : [rd, rn, rm],
                writesFlags: false,
                sourceText
            };
        }
        case "MOVZ":
        case "MOVK":
        {
            const rd = parseRegister(operands[0], "destination");
            const immediate = parseImmediate(operands[1], rd.width, 16);
            const shift = operands[2] ? parseLslImmediate(operands[2]) : 0;

            immediate.shift = shift;

            return {
                id: String(index),
                address,
                opcode,
                format: "move-wide",
                width: rd.width,
                rd,
                immediate,
                operands: [rd, immediate],
                writesFlags: false,
                sourceText
            };
        }
        case "LSL":
        case "LSR":
        case "ASR":
        {
            const rd = parseRegister(operands[0], "destination");
            const rn = parseRegister(operands[1], "general");
            const immediate = parseImmediate(operands[2], rd.width);

            return {
                id: String(index),
                address,
                opcode,
                format: "data-processing-immediate",
                width: rd.width,
                rd,
                rn,
                immediate,
                operands: [rd, rn, immediate],
                writesFlags: false,
                sourceText
            };
        }
        case "LDR":
        case "STR":
        {
            const rd = parseRegister(operands[0], "destination");
            const memory = parseMemoryOperand(operands[1], rd.width);

            return {
                id: String(index),
                address,
                opcode,
                format: "load-store-immediate",
                width: rd.width,
                rd,
                memory,
                operands: [rd, memory],
                writesFlags: false,
                sourceText
            };
        }
        case "B":
        {
            const offset = parseBranchTarget(operands[0]);

            return {
                id: String(index),
                address,
                opcode,
                format: "branch-immediate",
                width: 64,
                branch: {
                    kind: "unconditional",
                    offset,
                    target: address + offset
                },
                operands: [],
                writesFlags: false,
                sourceText
            };
        }
        case "CBZ":
        case "CBNZ":
        {
            const rn = parseRegister(operands[0], "general");
            const offset = parseBranchTarget(operands[1]);

            return {
                id: String(index),
                address,
                opcode,
                format: "compare-branch",
                width: rn.width,
                rn,
                branch: {
                    kind: "compare-zero",
                    offset,
                    target: address + offset,
                    conditionRegister: rn
                },
                operands: [rn],
                writesFlags: false,
                sourceText
            };
        }
        case "NOP":
        case "HLT":
            return {
                id: String(index),
                address,
                opcode,
                format: "system",
                width: 64,
                operands: [],
                writesFlags: false,
                sourceText
            };
        default:
            throw new Error(`Unsupported instruction: ${mnemonicPart}.`);
    }
}

function stripComment(line: string): string
{
    return line.replace(/\/\/.*$/, "").replace(/;.*$/, "");
}

function splitMnemonic(line: string): [string, string?]
{
    const match = line.match(/^([A-Za-z]+)\s*(.*)$/);

    if (!match)
    {
        throw new Error(`Invalid instruction line: ${line}.`);
    }

    return [match[1], match[2]];
}

function splitOperands(text: string): string[]
{
    const operands: string[] = [];
    let current = "";
    let bracketDepth = 0;

    for (const char of text)
    {
        if (char === "[")
        {
            bracketDepth += 1;
        }
        else if (char === "]")
        {
            bracketDepth -= 1;
        }

        if (char === "," && bracketDepth === 0)
        {
            operands.push(current.trim());
            current = "";
        }
        else
        {
            current += char;
        }
    }

    if (current.trim())
    {
        operands.push(current.trim());
    }

    return operands;
}

function parseRegister(text: string | undefined, role: "general" | "destination" | "add-sub"): RegisterOperand
{
    if (!text)
    {
        throw new Error("Missing register operand.");
    }

    if (text.trim().toUpperCase() === "SP")
    {
        return {
            kind: "register",
            encoded: 31,
            role: "stack-pointer",
            width: 64
        };
    }

    const match = text.trim().match(REGISTER_PATTERN);

    if (!match)
    {
        throw new Error(`Invalid register operand: ${text}.`);
    }

    const width: RegisterWidth = match[1].toUpperCase() === "X" ? 64 : 32;
    const encoded = parseEncodedRegister(match[2].toUpperCase());
    const registerRole = encoded === 31
        ? inferRegister31Role(match[2].toUpperCase(), role)
        : "general";

    return {
        kind: "register",
        encoded,
        role: registerRole,
        width
    };
}

function parseEncodedRegister(text: string): RegisterOperand["encoded"]
{
    if (text === "ZR" || text === "SP")
    {
        return 31;
    }

    const parsed = Number(text);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 30)
    {
        throw new Error(`Register number out of range: ${text}.`);
    }

    return parsed as RegisterOperand["encoded"];
}

function inferRegister31Role(text: string, role: "general" | "destination" | "add-sub")
{
    if (text === "SP")
    {
        return "stack-pointer";
    }

    if (text === "ZR")
    {
        return "zero-register";
    }

    if (role === "add-sub")
    {
        return "stack-pointer";
    }

    return "zero-register";
}

function parseImmediate(
    text: string | undefined,
    width?: RegisterWidth,
    defaultShift?: ImmediateOperand["shift"]
): ImmediateOperand
{
    if (!text?.startsWith("#"))
    {
        throw new Error(`Invalid immediate operand: ${text ?? "<missing>"}.`);
    }

    return {
        kind: "immediate",
        value: BigInt(text.slice(1)),
        width,
        shift: defaultShift,
        signed: text.slice(1).startsWith("-")
    };
}

function parseShift(text: string): { kind: "shift"; shiftKind: ShiftKind; amount: number }
{
    const match = text.trim().match(/^(LSL|LSR|ASR)\s+#([0-9]+)$/i);

    if (!match)
    {
        throw new Error(`Invalid shift operand: ${text}.`);
    }

    return {
        kind: "shift",
        shiftKind: match[1].toUpperCase() as ShiftKind,
        amount: Number(match[2])
    };
}

function parseLslImmediate(text: string): ImmediateOperand["shift"]
{
    const match = text.trim().match(/^LSL\s+#(0|16|32|48)$/i);

    if (!match)
    {
        throw new Error(`Invalid move-wide shift: ${text}.`);
    }

    return Number(match[1]) as ImmediateOperand["shift"];
}

function parseAddSubImmediateShift(text: string): ImmediateOperand["shift"]
{
    const match = text.trim().match(/^LSL\s+#(0|12)$/i);

    if (!match)
    {
        throw new Error(`Invalid add/sub immediate shift: ${text}.`);
    }

    return Number(match[1]) as ImmediateOperand["shift"];
}

function parseMemoryOperand(text: string | undefined, width: RegisterWidth): MemoryOperand
{
    const match = text?.trim().match(/^\[(.+?)(?:,\s*(#[^\]]+))?\]$/);

    if (!match)
    {
        throw new Error(`Invalid memory operand: ${text ?? "<missing>"}.`);
    }

    const base = parseRegister(match[1], "add-sub");
    const offset = match[2] ? parseImmediate(match[2], 64) : immediate(0n, 64);

    return {
        kind: "memory",
        base,
        offset,
        accessSize: width as DataSize,
        signed: false,
        writeback: "none"
    };
}

function parseBranchTarget(text: string | undefined): Word
{
    if (!text)
    {
        throw new Error("Missing branch target.");
    }

    return text.startsWith("#") ? BigInt(text.slice(1)) : BigInt(text);
}

function immediate(value: Word, width?: RegisterWidth): ImmediateOperand
{
    return {
        kind: "immediate",
        value,
        width,
        signed: value < 0n
    };
}
