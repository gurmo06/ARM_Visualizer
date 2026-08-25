/**
  * AArch64 General-Purpose Register File (GPRs).
  *
  * Hardware intent:
  * - Holds X0...X30 only. XZR/SP (encoded as reg=31) is not stored/accessed here.
  * - Provides two combinational read ports (readA/readB).
  * - Provides one sequential write port that commits on the "clock edge" once per cycle.
  */

export type RegIndex = number;          // 0...30
export type Word = bigint;              // 64-bit

/* Read-port Request (Combinational) */
export interface RFReadReq
{
    idx: RegIndex;                      // Source register index (0..30)
}

/* Write-port Request (Sequential) */
export interface RFWriteReq
{
    wr: boolean;                        // Write enable
    idx: RegIndex;                      // Destination register index (0..30)
    data: Word;                         // Data to write
}

/* Zero-extend a 32-bit value to 64 bits for write-back */
export const ZERO_EXT_32 = (x: Word) => (x & 0xFFFF_FFFFn);

/* Register File */
export class RegisterFile
{
    /* Register Storage */
    private regs: Word[] = Array(31);   // 31 GPRs (X0...X30)

    /*----------------- Construction & Lifecycle -----------------*/

    /* Constructor w/ optional seed state (for testing) */
    constructor(seed?: readonly Word[])
    {
        // Initialize 31 GPRs (X0...X30) w/ seed
        if (seed)
        {
            this.regs = seed.slice(0, 31);
        }
        // Default initialize to 0ns
        else
        {
            this.regs.fill(0n);
        }
    }

    /* Reset all registers to 0n */
    reset(): void
    {
        this.regs.fill(0n);
    }

    /*---------------- Read Ports (Combinational) ----------------*/

    /** Read Port A: Returns current value of register idx
      * Caller guarantees 0 <= idx <= 30 */
    readA(reqR: RFReadReq): Word
    {
        return this.regs[reqR.idx];
    }

    /* Read Port B: Mirrors Read Port A */
    readB(reqR: RFReadReq): Word
    {
        return this.regs[reqR.idx];
    }

    /*----------------- Write Ports (Sequential) -----------------*/

    /** Write Port: Commits into register idx if write enabled
      * Caller guarantees 0 <= idx <= 30 */
    write(reqW: RFWriteReq): void
    {
        if (reqW.wr)
        {
            this.regs[reqW.idx] = reqW.data;
        }
    }

    /*-------------------------- Debug ---------------------------*/

    /* Dump all register values as an array */
    snapshot(): readonly Word[]
    {
        return this.regs.slice();
    }

    /* Peek at a specific register value */
    peek(idx: RegIndex): Word
    {
        return this.regs[idx];
    }
}