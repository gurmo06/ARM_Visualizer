import type { CpuState, Instruction, RegisterOperand, Word } from "../sim/types";
import { ALU } from "../core/alu";

export class CPU
{
    private program: Instruction[];
    private state: CpuState;
    private alu: ALU;

    constructor(prog: Instruction[], initRegs: Word[] = Array(31).fill(0n))
    {
        this.program = prog;
        this.state = this.createInitialState(prog.length === 0, initRegs);
        this.alu = new ALU();
    }

    public current_state(): Readonly<CpuState>
    {
        return {
            ...this.state,
            registers: [...this.state.registers],
            pstate: { ...this.state.pstate }
        };
    }

    public reset_state(prog?: Instruction[], initRegs: Word[] = Array(31).fill(0n)): void
    {
        if (prog)
        {
            this.program = prog;
        }

        this.state = this.createInitialState(this.program.length === 0, initRegs);
    }

    public step(): void
    {
        if (this.state.halted)
        {
            return;
        }

        const instructionIndex = Number(this.state.pc / 4n);

        if (instructionIndex < 0 || instructionIndex >= this.program.length)
        {
            this.state.halted = true;
            return;
        }

        const instr = this.program[instructionIndex];

        switch (instr.opcode)
        {
            case "ADD":
            {
                if (!instr.rd || !instr.rn || !instr.rm)
                {
                    this.fault("ADD requires Rd, Rn, and Rm.");
                    return;
                }

                const result = this.alu.alu_exec({
                    op: "ADD",
                    a: this.readRegisterOperand(instr.rn),
                    b: this.readRegisterOperand(instr.rm),
                    width: instr.width
                });

                this.writeRegisterOperand(instr.rd, result.value);
                this.state.pc += 4n;
                break;
            }
            case "HLT":
            {
                this.state.halted = true;
                break;
            }
            default:
            {
                this.fault(`${instr.opcode} execution is not implemented yet.`);
                break;
            }
        }
    }

    private createInitialState(halted: boolean, initRegs: Word[]): CpuState
    {
        return {
            registers: initRegs.slice(0, 31),
            sp: 0n,
            pc: 0n,
            pstate: {
                negative: false,
                zero: false,
                carry: false,
                overflow: false
            },
            halted
        };
    }

    private readRegisterOperand(operand: RegisterOperand): Word
    {
        if (operand.encoded === 31)
        {
            return operand.role === "stack-pointer" ? this.state.sp : 0n;
        }

        return this.state.registers[operand.encoded];
    }

    private writeRegisterOperand(operand: RegisterOperand, value: Word): void
    {
        if (operand.encoded === 31)
        {
            if (operand.role === "stack-pointer")
            {
                this.state.sp = value;
            }

            return;
        }

        this.state.registers[operand.encoded] = value;
    }

    private fault(message: string): void
    {
        this.state.fault = message;
        this.state.halted = true;
    }
}
