# ARM Visualizer

A browser-based AArch64 CPU simulator for exploring how assembly instructions change
registers, flags, memory, and the instructions moving through a pipeline.

The current implementation uses a **five-stage, single-issue, in-order pipeline**.
You can run a program, advance one clock cycle at a time, and focus on an individual
instruction to inspect its operands, forwarding paths, stalls, results, and retirement.

The app is built with **TypeScript, React, and Vite** and runs entirely in the browser.
It models an educational AArch64 subset with explicit timing assumptions; it is not
a complete Arm emulator or a timing model of a specific Cortex processor.

**Live site:** https://arm-visualizer.pages.dev/

## What Works Today

| Area | Available now |
| --- | --- |
| Program input | Editable assembly and source-file upload (`.s`, `.asm`, `.txt`; up to 1 MiB). |
| Machine view | X0-X30, XZR, SP, architectural PC, fetch PC, NZCV flags, changed-register highlighting, and stage indicators in the program listing. |
| Pipeline view | IF, ID, EX, MEM, and WB activity; instruction focus; cycle timeline; interstage registers and valid bits. |
| Instruction inspection | Register inputs, forwarding sources and producer IDs, ALU inputs/results, memory addresses/data, NZCV results, and branch decisions. |
| Execution | Clock stepping, run/pause, reset, and adjustable playback from 1 to 16 simulated cycles per second. |
| History | The latest 256 snapshots, with cycle navigation and per-cycle events. |
| Data memory | 64 KiB of little-endian RAM, a 128-byte inspection window, address entry, paging, and SP tracking. |
| Pipeline behavior | EX/MEM and MEM/WB forwarding, load-use stalls, bubbles, taken-branch flushes, and ordered halt/fault handling. |
| Counters | Cycles, retired instructions, load-use stalls, flushed slots, and cycles per retired instruction (CPI). |

The sequential CPU is retained as a reference engine for tests. The website uses the
pipelined CPU.

## Run Locally

Use **Node.js 22.12 or newer** and npm.

```sh
git clone https://github.com/gurmo06/ARM_Visualizer.git
cd ARM_Visualizer
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`. No backend, database,
or API keys are needed.

To build and preview the production site:

```sh
npm run build
npm run preview
```

## Using the Simulator

The app starts with a loaded sample program.

1. Use **Step** to advance one clock cycle, or **Run** to advance continuously.
   **Pause** stops the clock; the speed slider controls playback, not modeled CPU frequency.
2. Inspect registers, flags, PCs, and memory in **Machine**. Several instructions can be
   active at once, so the listing shows the pipeline stage beside each active instruction.
3. Open **Pipeline**, or click a populated pipeline stage or a fetched instruction in
   the program listing. Select a stage or timeline row to focus that instruction instance.
4. Inspect its stage-by-stage journey and data. Repeated loop iterations have different
   instance IDs even when they originate from the same assembly address.
5. Use the history slider, arrows, timeline cells, or journey steps to inspect recorded
   cycles. Moving through history pauses playback.
6. To change the program, edit the source and use **Load program**. Editing pauses execution
   and disables Step/Run until the new source is loaded. Opening a source file loads it
   automatically.

**Reset and load program** reloads the editor's contents and clears registers, flags,
RAM, pipeline state, and history. Icon controls have hover tooltips.

### Live and History

**Live returns the display to the most recent simulated cycle. It does not start the clock.**
For example, `5 / 11` means you are inspecting cycle 5 while the latest state is cycle 11.
Live returns to `11 / 11`; Run resumes execution.

History is for inspection. Step and Run always continue from the latest machine state,
not from the historical state on screen. The latest **256 snapshots** are retained;
older snapshots and their instruction traces expire. The pipeline timeline displays
up to 16 recorded cycles and 24 instruction instances at a time.

## Sample Program

This is the program loaded by default, with comments added:

```asm
MOVZ X0, #2
MOVZ X1, #3
ADD X2, X0, X1     // X2 = 5
SUB SP, SP, #16    // Reserve a 16-byte stack slot
STR X2, [SP]      // Store eight bytes at the new SP
LDR X3, [SP]      // X3 = 5
SUBS X4, X3, #5   // X4 = 0; update NZCV
CBZ X4, #8        // If X4 is zero, branch forward eight bytes
MOVZ X5, #99      // Skipped by the taken branch
HLT
```

The sample retires **9 instructions in 16 cycles**. Its final state includes
`X0 = 2`, `X1 = 3`, `X2 = X3 = 5`, `X4 = X5 = 0`, `SP = 0xFFE0`,
and `NZCV = 0110`. The eight-byte value 5 remains stored at `0xFFE0`.

Useful cycles to inspect:

- **Cycle 5:** ADD is in EX, receiving X0 from MEM/WB and X1 from EX/MEM.
- **Cycle 8:** SUBS waits in ID for the preceding LDR. The pipeline inserts one load-use bubble.
- **Cycle 11:** CBZ resolves as taken in EX, flushing the younger MOVZ and HLT instances.
- **Cycle 12:** HLT is fetched again at the branch target.
- **Cycle 16:** HLT retires and the simulator stops.

### Branch Offsets

In this simulator's assembly input, branch offsets are **bytes relative to the branch
instruction's own address**. They are not instruction counts or absolute addresses.

In the sample, `CBZ X4, #8` at `0x001C` checks whether **X4 itself equals zero**.
A zero branches to `0x001C + 8 = 0x0024`, the HLT instruction. Otherwise, execution
continues at `0x0020`, the MOVZ instruction. CBZ and CBNZ do not test the PSTATE Z flag.

On a taken branch, this pipeline clears both younger stage slots and refetches the target.
That also discards an already-fetched instruction at the target address, as happens with
HLT in the sample. Fetching HLT by itself does not halt the CPU.

## Supported Assembly

| Instructions | Supported forms |
| --- | --- |
| `ADD`, `SUB`, `ADDS`, `SUBS` | Register or immediate operands; optional shifted register operands; immediate shift `LSL #0` or `LSL #12`. |
| `CMP` | Register or immediate comparison; updates flags without writing a destination. |
| `AND`, `ORR`, `EOR` | Register operands, with an optional register shift. |
| `MOVZ`, `MOVK` | Move-wide immediates, with an optional `LSL` halfword shift. |
| `LSL`, `LSR`, `ASR` | Immediate shift amounts. |
| `LDR`, `STR` | 32-bit or 64-bit transfers using `[base]` or `[base, #offset]`. |
| `B`, `CBZ`, `CBNZ` | PC-relative byte offsets. |
| `NOP`, `HLT` | No operation and simulator halt. |

Use X registers for 64-bit operations and W registers for 32-bit operations. W reads use
the low 32 bits; W writes clear the upper 32 bits of the corresponding X register.
XZR/WZR read as zero and discard writes. SP is a separate register.

The parser accepts one instruction per line, ignores blank lines, and supports `//`
and `;` comments. Each instruction occupies a four-byte program address beginning at
`0x0000`. End programs with HLT: fetching beyond the loaded program eventually faults
unless that speculative fetch is flushed.

Labels, assembler directives, machine-code input, logical immediates, and pre/post-indexed
memory syntax are not supported. The parser does not yet enforce every A64 encoding
restriction, including all immediate ranges and legal register combinations.

## Memory and Stack

Data RAM covers **65,536 byte addresses**, from `0x0000` through `0xFFFF` inclusive.
`0x10000` is one byte past the end. Unwritten bytes read as zero.

SP starts at `0xFFF0`, a 16-byte-aligned address near the top of RAM. Stack growth is
explicit: subtract from SP to allocate space, access that space, then add to SP to
release it. `STR X0, [SP]` alone stores eight bytes and does not change SP.

The memory inspector shows eight rows of 16 bytes. Enter a hexadecimal address or use
the page arrows to navigate; **Follow stack pointer** keeps the window near SP.
Written bytes and the current SP byte are highlighted. The written-byte count records
touched locations, not allocated stack or heap space.

Loads and stores use little-endian byte order and require natural alignment in this model:
four bytes for W transfers and eight bytes for X transfers. Memory accesses through SP
also require SP to be 16-byte aligned. SP arithmetic itself does not trigger that check.
Out-of-range and unaligned accesses produce faults.

Instructions are held in a separate decoded program store. The RAM inspector displays
data memory, not encoded instruction bytes.

## Pipeline Model

| Stage | Work performed | Output register |
| --- | --- | --- |
| IF | Fetch at fetch PC; advance sequentially by four bytes. | IF/ID |
| ID | Read and route register, SP, and zero-register operands. | ID/EX |
| EX | Forward operands; execute ALU/shift operations; calculate addresses and resolve branches. | EX/MEM |
| MEM | Load or store data memory. | MEM/WB |
| WB | Retire the instruction and commit register/SP and NZCV results. | Architectural state |

A snapshot shows the work performed during its numbered cycle and the latch contents
at the end of that cycle. The first instruction enters IF at cycle 1 and reaches WB
at cycle 5. A straight-line, unstalled program of N instructions including HLT takes
N + 4 cycles.

- **Forwarding:** EX/MEM and MEM/WB supply values to EX; the closest older writer wins.
  This includes arithmetic operands, memory bases, store data, SP, branch inputs, and
  MOVK's previous destination value. WB writes are visible to ID in the same cycle.
- **Load-use hazards:** an immediate consumer of an LDR result waits one cycle.
  PC and IF/ID are held while a bubble enters ID/EX. Load-to-store dependencies also
  stall; there is no late store-data bypass into MEM.
- **Branches:** fetch proceeds sequentially until EX resolves the branch. A taken branch
  flushes the two younger stage slots and fetches its target next cycle.
- **Halt and faults:** HLT stops fetch in EX and halts on retirement. Faults travel with
  their instructions and are reported at WB, allowing older work to finish while
  suppressing younger side effects. Wrong-path instructions and fetch faults can be flushed.
- **Memory timing:** each access takes one MEM cycle. Instruction fetch and data access
  can happen in the same cycle; caches and variable latency are not modeled.

**Architectural PC** tracks the next address after the last retired instruction, or
the address of a retiring HLT/fault. **Fetch PC** identifies the next fetch address
and can be ahead of architectural PC or on a path later discarded.

The `PipelineCPU.run(n)` API executes up to n additional cycles and can resume after
reaching that budget. The UI uses individual clock steps and runs until paused,
halted, or faulted.

## Development and Checks

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite's development server. |
| `npm run typecheck` | Check the TypeScript projects. |
| `npm test` | Run simulator and React tests with Vitest. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Type-check and generate the static site in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run test:e2e` | Run Playwright's desktop and mobile browser workflows. |

Install Chromium before running the browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, use an installed Google Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Playwright starts or reuses a local server at `http://127.0.0.1:5174`. Browser artifacts
are written to `test-results/`. Tests cover register behavior, flags, memory, branches,
forwarding, stalls, flushing, faults, snapshot isolation, and UI playback/history.
Pipeline tests also compare final architectural state with the sequential CPU.

Known test caveat: [the browser workflow](tests/e2e/pipeline.spec.ts) still contains
heading assertions for the old name, "System Visualizer". Those assertions need to
be updated to "ARM Visualizer" for the first workflow to pass with the current UI.

### Project Layout

| Path | Responsibility |
| --- | --- |
| [`src/app/`](src/app/) | Machine view, pipeline inspector, memory inspector, and execution/history controls. |
| [`src/top/pipeline_cpu.ts`](src/top/pipeline_cpu.ts) | Clock sequencing, memory access, retirement, and fault ordering. |
| [`src/top/cpu.ts`](src/top/cpu.ts) | Sequential reference CPU. |
| [`src/pipe/`](src/pipe/) | Pipeline latches, dependencies, forwarding, hazards, EX, and branch resolution. |
| [`src/decode/`](src/decode/) | Assembly parsing and immediate handling. |
| [`src/core/`](src/core/) | ALU, shifter, and register-related building blocks. |
| [`src/mem/`](src/mem/) | Fetch and data-memory support. |
| [`src/sim/`](src/sim/) | Shared instruction/state types, pipeline snapshots, and memory layout. |
| [`tests/`](tests/) | Simulator and React tests, plus Playwright workflows in `tests/e2e/`. |
| [`public/`](public/) | Static assets, including the CPU favicon. |

TypeScript code uses four-space indentation, semicolons, and Allman-style braces.
Keep simulator behavior independently testable from the UI.

## Deploy to Cloudflare Pages

The production output is a static site. Use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Node.js version | A version compatible with the local setup above. |

## Scope and Next Steps

The initial project setup, shared instruction model, sequential CPU, instruction subset,
focused tests, and five-stage pipeline are implemented. The main website workflows are
also available, including source upload and instruction-level pipeline inspection.

Areas still to implement or expand:

- Encoded 32-bit instruction decoding, machine-code upload, labels, and stricter assembly validation.
- More AArch64 instructions and addressing modes, including pre/post-indexed loads and stores.
- Instruction/data caches, refill timing, and variable memory latency.
- MMU/TLB behavior and branch prediction.
- More detailed performance counters beyond the existing cycle, retirement, stall, flush, and CPI values.

There is no privilege-level model, exception vectoring, operating-system environment,
or self-modifying code support. HLT is a simulator stop convention, not a modeled
architectural debug exception. The five-stage organization, single-cycle memory, and
alignment policy are explicit simulator choices.

## License

See [LICENSE](LICENSE) for the GNU General Public License, version 3.
