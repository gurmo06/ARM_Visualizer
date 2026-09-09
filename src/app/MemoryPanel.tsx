import { useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import { MEMORY_HIGH_ADDRESS, STACK_WINDOW_BYTES } from "../sim/memory_layout";
import type { PipelineSnapshot } from "../sim/pipeline";
import { formatHex } from "./format";

export function MemoryPanel({ snapshot }: { snapshot: PipelineSnapshot })
{
    const [followSp, setFollowSp] = useState(true);
    const [address, setAddress] = useState("FF80");
    const parsed = /^[0-9a-f]{1,4}$/i.test(address.replace(/^0x/i, "")) ? parseInt(address, 16) : undefined;
    const top = Number(MEMORY_HIGH_ADDRESS) + 1 - STACK_WINDOW_BYTES;
    const base = Math.min(top, Math.max(0, followSp ? Math.floor(Number(snapshot.sp) / 16) * 16 - 64 : (parsed ?? 0) - (parsed ?? 0) % 16));
    const bytes = new Map(snapshot.memory.map((cell) => [Number(cell.address), cell.value]));
    return <section className="memory-section">
        <div className="section-heading"><h2>Data memory <span className="muted">64 KiB</span></h2><div className="memory-controls">
            <button type="button" className="icon-button small" title="Follow stack pointer" aria-label="Follow stack pointer" aria-pressed={followSp} onClick={() => setFollowSp(!followSp)}><Crosshair size={16} /></button>
            <label>Address <input aria-label="Memory address" value={followSp ? base.toString(16).toUpperCase().padStart(4, "0") : address} maxLength={6} aria-invalid={!followSp && parsed === undefined} onChange={(event) => { setAddress(event.target.value); setFollowSp(false); }} /></label>
            <button type="button" className="icon-button small" aria-label="Previous memory page" title="Previous memory page" disabled={base === 0} onClick={() => { setFollowSp(false); setAddress(Math.max(0, base - 128).toString(16)); }}><ChevronLeft size={16} /></button>
            <button type="button" className="icon-button small" aria-label="Next memory page" title="Next memory page" disabled={base === top} onClick={() => { setFollowSp(false); setAddress(Math.min(top, base + 128).toString(16)); }}><ChevronRight size={16} /></button>
        </div></div>
        <div className="memory-map-labels"><code>0x0000</code><span>{bytes.size} written bytes / SP {formatHex(snapshot.sp, 4)}</span><code>0xFFFF</code></div>
        <div className="memory-address-map"><span className="memory-window-marker" style={{ left: `${base / 65536 * 100}%` }} /><span className="sp-marker" title={`SP ${formatHex(snapshot.sp, 4)}`} style={{ left: `${Math.max(0, Math.min(100, Number(snapshot.sp) / 65536 * 100))}%` }} /></div>
        {!followSp && parsed === undefined && <p className="inline-fault">Address must be hexadecimal, 0000-FFFF.</p>}
        <div className="memory-scroll"><table className="memory-table"><thead><tr><th>Address</th>{Array.from({ length: 16 }, (_, i) => <th key={i}>{i.toString(16).toUpperCase()}</th>)}</tr></thead><tbody>
            {Array.from({ length: 8 }, (_, row) => base + row * 16).map((start) => <tr className={BigInt(start) <= snapshot.sp && snapshot.sp < BigInt(start + 16) ? "sp-row" : ""} key={start}><th>{formatHex(BigInt(start), 4)}</th>{Array.from({ length: 16 }, (_, i) => <td key={i} className={`${bytes.has(start + i) ? "written-byte" : ""} ${snapshot.sp === BigInt(start + i) ? "sp-byte" : ""}`} title={`${formatHex(BigInt(start + i), 4)}${snapshot.sp === BigInt(start + i) ? " / SP" : ""}`}>{(bytes.get(start + i) ?? 0).toString(16).toUpperCase().padStart(2, "0")}</td>)}</tr>)}
        </tbody></table></div>
    </section>;
}
