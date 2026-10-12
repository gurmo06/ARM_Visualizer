import { expect, test } from "@playwright/test";

test("inspect forwarding, stalls, retirement, history, and memory", async ({ page }, testInfo) =>
{
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ARM Visualizer" })).toBeVisible();
    const step = page.getByRole("button", { name: "Step one clock cycle" });
    for (let i = 0; i < 5; i += 1) await step.click();
    await page.getByRole("button", { name: "EX: ADD X2, X0, X1", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ARM Visualizer" })).toBeInViewport();
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

test("inspect learned predictions and compare loop execution with the static baseline", async ({ page }, testInfo) =>
{
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByRole("textbox", { name: "Assembly program" }).fill("MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT");
    await page.getByRole("button", { name: "Load program", exact: true }).click();
    const step = page.getByRole("button", { name: "Step one clock cycle" });
    for (let i = 0; i < 9; i += 1) await step.click();
    await page.getByRole("button", { name: "EX: CBNZ X0, #-4", exact: true }).click();
    const inspector = page.getByRole("region", { name: "Instruction inspector" });
    const predictor = page.getByRole("region", { name: "Branch predictor" });
    await expect(inspector.getByText("Correct", { exact: true })).toBeVisible();
    await expect(inspector.getByText("2 / Weak taken")).toBeVisible();
    await expect(predictor.getByText("3 / Strong taken")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("pipeline-prediction.jpg"), quality: 75 });
    await page.getByRole("button", { name: "Inspect cycle 7, IF" }).click();
    await expect(inspector.getByText("Correct", { exact: true })).toHaveCount(0);
    await expect(predictor.getByText("2 / Weak taken")).toBeVisible();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await page.getByRole("slider", { name: "Clock speed" }).press("End");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Halted", { exact: true })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("30");
    await expect(predictor.getByText("80.0%")).toBeVisible();
    await expect(predictor.locator(".predictor-metrics")).toContainText("Resolved branches 10");
    await expect(predictor.locator(".predictor-metrics")).toContainText("Mispredictions 2");
    await predictor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("branch-predictor-table.jpg"), quality: 75 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("combobox", { name: "Branch prediction" }).selectOption("not-taken");
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
    await expect(page.getByRole("table", { name: "Branch target buffer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Halted", { exact: true })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("44");
    await expect(predictor.locator(".predictor-metrics")).toContainText("Mispredictions 9");
    await page.getByRole("combobox", { name: "Branch prediction" }).selectOption("two-bit");
    await expect(predictor.getByText("No trained entries")).toBeVisible();
    expect(errors).toEqual([]);
});

for (const { mode, trained, exited } of [
    { mode: "one-bit", trained: "1 / Last taken", exited: "0 / Last not taken" },
    { mode: "taken", trained: "Always taken", exited: "Always taken" }
])
{
    test(`inspect ${mode} predictions, historical state, and reset`, async ({ page }, testInfo) =>
    {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("/");
        await page.getByRole("textbox", { name: "Assembly program" }).fill("MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT");
        await page.getByRole("button", { name: "Load program", exact: true }).click();
        const selector = page.getByRole("combobox", { name: "Branch prediction" });
        await expect(selector.locator("option")).toHaveCount(4);
        await selector.selectOption(mode);
        const step = page.getByRole("button", { name: "Step one clock cycle" });
        for (let i = 0; i < 9; i += 1) await step.click();
        await page.getByRole("button", { name: "EX: CBNZ X0, #-4", exact: true }).click();
        const inspector = page.getByRole("region", { name: "Instruction inspector" });
        const predictor = page.getByRole("region", { name: "Branch predictor" });
        await expect(inspector.getByText(trained, { exact: true })).toBeVisible();
        await expect(predictor.getByText(trained, { exact: true })).toBeVisible();
        await expect(inspector.getByText("Correct", { exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`${mode}-controls.jpg`), quality: 75 });
        await page.getByRole("slider", { name: "Clock speed" }).press("End");
        await page.getByRole("button", { name: "Run", exact: true }).click();
        await expect(page.getByText("Halted", { exact: true })).toBeVisible();
        await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("30");
        await expect(predictor.getByText(exited, { exact: true })).toBeVisible();
        await expect(inspector.getByText(trained, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Inspect cycle 9, EX" }).click();
        await expect(predictor.getByText(trained, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Live", exact: true }).click();
        await expect(predictor.getByText(exited, { exact: true })).toBeVisible();
        await predictor.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`${mode}-predictor.jpg`), quality: 75 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.getByRole("button", { name: "Reset and load program" }).click();
        await expect(selector).toHaveValue(mode);
        await expect(page.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
        await expect(predictor.getByText("No trained entries")).toBeVisible();
        expect(errors).toEqual([]);
    });
}

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
