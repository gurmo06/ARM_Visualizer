import { expect, test } from "@playwright/test";

test("inspect forwarding, stalls, retirement, history, and memory", async ({ page }, testInfo) =>
{
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "System Visualizer" })).toBeVisible();
    const step = page.getByRole("button", { name: "Step one clock cycle" });
    for (let i = 0; i < 5; i += 1) await step.click();
    await page.getByRole("button", { name: "EX: ADD X2, X0, X1", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System Visualizer" })).toBeInViewport();
    const inspector = page.getByRole("region", { name: "Instruction inspector" });
    await expect(inspector.getByText("EX/MEM / #2")).toBeVisible();
    await expect(inspector.getByText("MEM/WB / #1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await inspector.scrollIntoViewIfNeeded();
    const clockBounds = await step.boundingBox();
    expect(clockBounds!.y).toBeGreaterThanOrEqual(0);
    expect(clockBounds!.y + clockBounds!.height).toBeLessThan(page.viewportSize()!.height);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("pipeline-forwarding.png"), fullPage: true });
    await page.getByRole("button", { name: "Inspect cycle 4, ID" }).click();
    await expect(inspector.getByText("#3 / In ID")).toBeVisible();
    await expect(inspector.getByText("EX/MEM / #2")).toHaveCount(0);
    await page.getByRole("button", { name: "Inspect cycle 5, EX" }).click();
    await expect(inspector.getByText("#3 / In EX")).toBeVisible();

    for (let i = 0; i < 3; i += 1) await step.click();
    await page.getByRole("button", { name: "ID: SUBS X4, X3, #5", exact: true }).click();
    await expect(inspector.getByText("#7 / Stalled in ID")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("pipeline-stall.png"), fullPage: true });
    await page.getByRole("slider", { name: "Clock speed" }).press("End");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Halted", { exact: true })).toBeVisible();
    await expect(inspector.getByText("#7 / Retired")).toBeVisible();
    await page.getByRole("button", { name: "Machine", exact: true }).click();
    await expect(page.locator(".register-grid > div").filter({ has: page.getByText("X3", { exact: true }) })).toContainText("0x0000000000000005");
    await expect(page.locator(".memory-table td.written-byte").first()).toHaveText("05");
    await page.screenshot({ path: testInfo.outputPath("machine-completed.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test("pause, reset, invalid program, and precise memory fault", async ({ page }) =>
{
    await page.goto("/");
    await page.getByRole("textbox", { name: "Assembly program" }).fill("B #0");
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Load program", exact: true }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).not.toHaveValue("0");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const paused = await page.getByRole("slider", { name: "Recorded cycle" }).inputValue();
    await page.getByRole("button", { name: "Pipeline", exact: true }).click();
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue(paused);
    await page.getByRole("button", { name: "Reset and load program" }).click();
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
    await page.getByRole("button", { name: "Machine", exact: true }).click();
    await page.getByRole("textbox", { name: "Assembly program" }).fill("INVALID");
    await page.getByRole("button", { name: "Load program", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Unsupported instruction");
    await page.getByRole("textbox", { name: "Assembly program" }).fill("LDR X0, [SP, #16]\nSTR X1, [SP]\nHLT");
    await page.getByRole("button", { name: "Load program", exact: true }).click();
    await page.getByRole("slider", { name: "Clock speed" }).press("End");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Memory access out of range");
    await expect(page.locator(".written-byte")).toHaveCount(0);
});
