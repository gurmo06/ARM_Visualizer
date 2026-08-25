import type { CPUState, Instruction, ALUInstruction } from "../defunct/types";
import { ALU } from "../core/alu";

export class CPU
{
    private program: Instruction[];     // Program loaded into the CPU, shouldn't change during execution
    private state: CPUState;            // Current state of the CPU, changes during execution
    private alu: ALU;                   // ALU instance for all operations

    // Initializes the CPU with a program and initial
    // zeroed register values if registers not provided
    constructor(prog: Instruction[], initRegs: bigint[] = Array(32).fill(0))
    {
        this.program = prog;
        this.state = { regs: [...initRegs], pc: 0n, halt: (prog.length === 0) };
        this.alu = new ALU();
    }

    // Returns a read-only snapshot of the current CPU state
    public current_state(): Readonly<CPUState>
    {
        // Return a copy to prevent external mutation
        return { regs: [...this.state.regs], pc: this.state.pc, halt: this.state.halt };
    }

    // Resets the CPU state to initial conditions, can optionally
    // load a new program and initial register values
    public reset_state(prog?: Instruction[], initRegs: bigint[] = Array(32).fill(0)): void
    {
        // Load new program if provided
        if (prog)
            { this.program = prog; }

        // Reset CPU state
        this.state = { regs: [...initRegs], pc: 0n, halt: (this.program.length === 0) };
    }

    // Executes a single instruction cycle
    public step(): void
    {
        // If halted, do nothing
        if (this.state.halt)
            { return; }

        // If PC is out of bounds, halt the CPU
        if (this.state.pc < 0n || this.state.pc >=  BigInt(this.program.length))
            { this.state.halt = true; return; }
        

        // Fetch the current instruction
        const instr = this.program[Number(this.state.pc)];
        switch (instr.op)
        {
            // ADD instruction, send as ADD to ALU
            case "ADD":
            {
                const aluInstr: ALUInstruction =
                {
                    op: "ADD",
                    a: this.state.regs[instr.rn!],
                    b: this.state.regs[instr.rm!],
                    dest: this.state.regs[instr.rd!]
                };
                this.alu.alu_exec(aluInstr);
                this.state.regs[instr.rd!] = aluInstr.dest;
                this.state.pc += 1n;
                break;
            }
        }
    }
}
