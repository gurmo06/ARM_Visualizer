# System Visualizer

An interactive AArch64 subset simulator with a five-stage, single-issue, in-order pipeline.
The React frontend runs entirely in the browser. The sequential `CPU` remains available as
a reference engine; the website uses `PipelineCPU`.

## Development

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Cloudflare Pages uses the **React (Vite)** preset,
`npm run build`, and the `dist` output directory.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests cover desktop and mobile layouts and save screenshots in `test-results/`.
To use an installed Google Chrome instead of downloading Chromium:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

## Using the Simulator

1. Edit assembly or open a `.s`, `.asm`, or `.txt` file, then load the program.
2. Step advances **one clock cycle**. Run advances continuously at the selected clock speed;
   Pause preserves the current state. Reset reloads the editor and clears RAM and history.
3. Open **Pipeline**, or select an executed instruction in the program listing or stage strip.
4. Select a stage or timeline row to focus an instruction instance. The inspector shows its
   journey, register inputs, forwarding sources and producer IDs, ALU inputs/result, NZCV,
   memory address/data, and branch decision. Loop iterations have separate instance IDs.
5. Use the cycle slider, arrows, timeline cells, or journey steps to inspect recorded cycles.
   This pauses playback. **Live** returns to the newest state; Step/Run always continue from
   that live state, without re-executing or modifying historical snapshots.

History retains the latest **256 snapshots** to bound memory consumption. The timeline shows
up to 16 cycles and 24 instruction instances. Older snapshots and expired instruction traces
are discarded. The memory inspector shows eight 16-byte rows, with address entry, paging,
and optional SP tracking. RAM spans `0x0000` through `0xFFFF`; initial SP is `0xFFF0`.

## Pipeline Timing

| Stage | Work during the cycle | Output register |
| --- | --- | --- |
| IF | Fetch at the speculative fetch PC; advance by four bytes | IF/ID |
| ID | Route register/SP/XZR operands and read the register file | ID/EX |
| EX | Forward operands; run the shifter/ALU or calculate addresses/branches | EX/MEM |
| MEM | Read or write data memory | MEM/WB |
| WB | Retire; commit registers/SP and NZCV | Architectural state |

Snapshots describe work performed during the numbered cycle and latch contents at its end.
The first instruction appears in IF at cycle 1, EX at cycle 3, and commits in WB at cycle 5.
A straight-line program of N instructions, including HLT, takes N + 4 cycles without stalls.
Architectural PC records the next address after the last retired instruction (or the HLT/fault
address). Fetch PC is separate and can be ahead or on a path that will later be discarded.

- Stage inputs always come from the preceding clock edge. WB writes are visible to ID reads
  in the same cycle. A bubble has a clear valid bit and cannot produce side effects.
- EX/MEM and MEM/WB forwarding covers both arithmetic inputs, SP, memory bases, store data,
  compare-branch inputs, and MOVK's old destination value. The newest writer wins.
- W and X names alias the same physical register. W reads use the low 32 bits and W writes
  clear the upper half. XZR/WZR never become forwarding producers or dependencies.
- An immediate consumer of LDR stalls for one cycle: hold PC and IF/ID, inject an ID/EX
  bubble. Loaded data is forwarded from MEM/WB on the following EX cycle. This model also
  stalls load-to-store dependencies; it has no separate late MEM store-data bypass.
- Sequential fetch assumes a branch is not taken. Taken branches resolve in EX, discard the
  two younger IF/ID-stage slots, and fetch the target next cycle: a two-cycle penalty.
- HLT stops fetch in EX and discards younger instructions; older instructions finish before
  HLT retires. Wrong-path HLT and fetch faults can be flushed by an older branch.
- Faults are carried with the instruction and reported on retirement. Older work completes;
  younger register, flag, and memory changes are suppressed. An older MEM fault takes priority
  over a younger EX branch. A malformed source program is rejected when loading.
- `PipelineCPU.run(n)` executes up to n additional cycles, then pauses without inventing a CPU
  fault. It can resume. The UI timer stops at HLT/fault and otherwise runs until paused.

## Hardware Scope

This is an educational microarchitecture executing an AArch64 instruction subset, not a timing
model of a particular Cortex core. Pipeline length and implementation are microarchitectural
choices, as described in [Arm's architecture overview](https://www.arm.com/architecture/cpu).

Assembly is decoded into the shared instruction model at load time; IF fetches that model
from a separate program store. ID models control/operand routing. There is no encoded-word
decoder, binary file support, instruction RAM aliasing, or self-modifying code yet. Supported
opcodes are ADD, SUB, ADDS, SUBS, CMP, AND, ORR, EOR, MOVZ, MOVK, LSL, LSR, ASR, LDR, STR,
B, CBZ, CBNZ, NOP, and HLT. Branches use PC-relative byte offsets, not labels. The existing
assembly parser accepts only a subset of operand forms and does not validate all A64 encoding
restrictions. Pre/post-indexed memory writeback is not supported by the pipeline.

Memory accesses take one MEM cycle with independent instruction fetch and data access paths.
Data RAM uses little-endian, naturally aligned 32/64-bit accesses. This is a strict alignment
configuration; it does not model the memory attributes or controls that permit some unaligned
accesses on real hardware. SP alignment checking is enabled when accessing memory through SP,
not on every SP arithmetic write; see [Arm's stack alignment explanation](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/using-the-stack-in-aarch32-and-aarch64).
HLT is a simulator stop convention rather than a modeled debug exception. Privilege levels,
exception vectoring, MMU/TLB, caches, branch prediction, and variable memory latency remain
future work.

## Code Layout

- `src/top/pipeline_cpu.ts`: clock sequencing, fetch, MEM, retirement, fault ordering.
- `src/pipe/`: latches, operand dependencies, forwarding, hazards, EX, and branch resolution.
- `src/sim/`: shared architectural and pipeline snapshot types and memory layout.
- `src/core/`, `src/mem/`, `src/decode/`: ALU, shifts, memory, and assembly instruction model.
- `src/top/cpu.ts`: sequential reference engine used by differential tests.
- `src/app/`: machine view, pipeline inspector, history controls, and RAM inspector.
- `tests/`: simulator and React tests; `tests/e2e/`: browser workflows.

## Conventions

Helpful Terminology:
    Combinational - Immediate output change upon input changes
    Sequential - Has states; updates output on clock edge

Coding Hygiene:
    Brace style: Allman (opening brace on its own line).
    Indent: 4 spaces. No tabs.
    Max line length: ~100 chars (wrap thoughtfully).
    Semicolons: required.
    Trailing whitespace: none.
    One blank line between top-level declarations; avoid vertical noise.
