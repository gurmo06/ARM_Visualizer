/**
  * AArch64 Stack Pointer (SP).
  *
  * Hardware intent:
  * - Sp/XZR selection handled by operand router.
  * - Provides a combinational read of the current SP value.
  * - Provides a sequential write interface for next SP value.
  * - Enforce 16-byte alignment on writes (AAPCS64).
  */

import type { Word } from "./register_file"     // 64-bit

/* Stack Pointer */
export class StackPointer
{
    /* Internal SP storage */
    private sp: Word = 0n;

    /*---------------- Read Ports (Combinational) ----------------*/

    /* Combinational read */
    read(): Word
    {
        return this.sp;                 // 64-bit
    }

    /*----------------- Write Ports (Sequential) -----------------*/

    /* Sequential: write on clock edge */
    write(next: Word): void
    {
        // Assert 16-byte alignment
        if ((next & 0xFn) !== 0n)
        {
            throw new Error("SP not 16-byte aligned");
        }
        this.sp = next;
    }

    /*-------------------------- Debug ---------------------------*/

    /* Get current SP value */
    snapshot(): Word
    {
        return this.sp;
    }
}