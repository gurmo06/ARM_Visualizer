export type Opcode = "ADD";
export type ALUOpcode = "ADD";
export type Word = bigint;

export interface Instruction
{
    op: Opcode;             // Instruction opcode
    rn?: number;            // Source 1 register
    rm?: number;            // Source 2 register
    rd?: number;            // Destination register
    imm?: Word;             // Immediate value
}

export interface CPUState
{
    regs: Word[];           // Array of registers (X0 - X30) and XZR/SP (X31)
    pc: Word;               // Program counter
    halt: boolean;          // Indicates if the CPU is stalled (temporary)
}

export interface ALUInstruction
{
    op: ALUOpcode;          // ALU opcode
    a: Word;                // Operand A
    b: Word;                // Operand B
    dest: Word;             // Destination register
}