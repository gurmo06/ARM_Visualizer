src/
  top/
    cpu.ts                 # “SoC/Top”: owns clocking, connects blocks, orchestrates stage order
  core/
    register_file.ts       # RF: 2 read ports, 1 write port, XZR behavior
    alu.ts                 # ALU: pure combinational (ADD/SUB/AND/ORR/EOR, shifts via shifter)
    shifter.ts             # Barrel shifter / operand2 (LSL/LSR/ASR/ROR)
    pstate.ts              # NZCV flags register + update rules (ADDS/SUBS, CMP, etc.)
  decode/
    decoder.ts             # 32-bit word → IR/control (Rd/Rn/Rm/imm/shift/kind)
    immgen.ts              # Immediate encoders/decoders (add-imm, logical-imm, movz/movk)
  mem/
    memory.ts              # Byte-addressable, little-endian backing store (unified I+D initially)
    fetch.ts               # Instruction fetch front-end (reads 32b @ PC, PC+4 unless redirected)
    lsu.ts                 # Load/Store Unit: addr calc, size/sign-ext, alignment, talks to memory
  pipe/
    pipeline_regs.ts       # IF/ID, ID/EX, EX/MEM, MEM/WB latch structs (+ reset/flush helpers)
    hazards.ts             # RAW + load/use detection: stall/flush decisions
    forwarding.ts          # Operand select muxing from EX/MEM/WB paths
    branch_unit.ts         # Branch target + condition eval (uses PSTATE), mispredict flush signals
  perf/                    # (later) realistic front/back-end
    icache.ts              # I-cache (blocking), tags + refill FSM
    dcache.ts              # D-cache (blocking, write-through to start)
    tlb.ts                 # (later) simple TLB
    predictor.ts           # (later) static/1-bit/2-bit + simple BTB

# Implementation Order:
### 1. Create the project shell
  - TypeScript configuration.
  - Vitest or another test runner.
  - Vite frontend.
  - React or another UI framework.
  - Shared simulator/frontend types.

### 2. Define a single AArch64 instruction model
  - Remove the dependency on defunct/types.ts.
  - Define opcode, operands, immediate values, widths, flags, memory operations, and branch metadata.
  - Decide whether the first version uses assembly input, encoded 32-bit words, or both.

### 3. Implement a non-pipelined CPU first
  - Program counter.
  - Fetch.
  - Decoder.
  - Register/SP/XZR operand routing.
  - ALU and shifter.
  - PSTATE/NZCV.
  - Writeback.
  - Halt and invalid-instruction behavior.

### 4. Start with a small instruction subset
  - ADD, SUB
  - ADDS, SUBS
  - AND, ORR, EOR
  - MOVZ, MOVK
  - LSL, LSR, ASR
  - LDR, STR
  - B, CBZ, CBNZ
    This is enough to demonstrate arithmetic, flags, data movement, memory, and control flow.

### 5. Add focused tests
  - Register reads and writes.
  - XZR behavior.
  - SP-based addressing.
  - 32-bit versus 64-bit operations.
  - NZCV updates.
  - Immediate decoding.
  - Little-endian memory.
  - Branch targets.
  - Load/store behavior.
  - Program-counter updates.

### 6. Implement the five-stage pipeline
  - IF, ID, EX, MEM, WB registers.
  - Valid bits and bubbles.
  - Stalls.
  - Flushes after branches.
  - EX/MEM and MEM/WB forwarding.
  - Load-use hazard detection.
  - Per-cycle pipeline snapshots.

### 7. Build the website around the observable state
  - Instruction/program editor.
  - File upload for source or machine code.
  - Register panel.
  - PC and PSTATE panel.
  - Memory inspector.
  - Pipeline visualization.
  - Current instruction highlighting.
  - Clock, step, run, pause, reset, and speed controls.
  - Event/history timeline.
  - Error panel for invalid instructions and alignment faults.

### 8. Add advanced hardware features later
  - Instruction and data caches.
  - TLB.
  - Branch predictor.
  - Cache misses and refill timing.
  - Performance counters.