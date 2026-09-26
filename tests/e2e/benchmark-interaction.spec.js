import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const evidence = JSON.parse(fs.readFileSync(new URL('../../src/data/benchmark-evidence.json', import.meta.url), 'utf8'));
test('Homepage evidence contains only two flat graphs with matching adjacent spacing', async ({ page }, info) => {
  await page.goto('/');
  const section = page.getByRole('region', { name: evidence.presentationTitle });
  await expect(section.locator('figure')).toHaveCount(2);
  await expect(section.locator('.benchmark-chart svg')).toHaveCount(2);
  await expect(section.locator('.benchmark-results, .benchmark-intro, button,select,details')).toHaveCount(0);
  await expect(section).not.toContainText('% smaller');
  for (const row of evidence.presentationComparisons) {
    await expect(section.getByText(Math.round(row.baselineTokens / row.baselinePassed).toLocaleString('en-US'), { exact: true })).toBeVisible();
    await expect(section.getByText(Math.round(row.offloadTokens / row.offloadPassed).toLocaleString('en-US'), { exact: true })).toBeVisible();
  }
  await expect(section.getByText('Astra kept the same accuracy; Opus missed two checks.', { exact: false })).toBeVisible();
  const spacing = await section.evaluate(el => {
    const adjacent = document.querySelector('.site-preview'), ownStyle = getComputedStyle(el), otherStyle = getComputedStyle(adjacent);
    return { own: [el.getBoundingClientRect().x, el.getBoundingClientRect().width, ownStyle.paddingTop, ownStyle.paddingBottom, ownStyle.paddingLeft], other: [adjacent.getBoundingClientRect().x, adjacent.getBoundingClientRect().width, otherStyle.paddingTop, otherStyle.paddingBottom, otherStyle.paddingLeft], radius: ownStyle.borderRadius, background: ownStyle.backgroundColor, pageBackground: getComputedStyle(document.body).backgroundColor };
  });
  expect(spacing.own).toEqual(spacing.other);
  expect(spacing.radius).toBe('0px'); expect(spacing.background).toBe('rgba(0, 0, 0, 0)'); expect(spacing.pageBackground).toBe('rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const audit = await new AxeBuilder({ page }).include('.benchmark-evidence').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  await section.screenshot({ path: `test-results/benchmark-flat-${info.project.name}.png` });
});

test('Plain bars show a small per-arm tooltip on hover and touch', async ({ page }, info) => {
  await page.goto('/');
  const charts = page.locator('.benchmark-chart');
  await expect(charts).toHaveCount(2);
  const row = evidence.presentationComparisons[1];
  for (const index of [0, 1]) {
    const chart = charts.nth(index);
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator('svg path[fill="#aaa"]')).toHaveCount(2);
    await expect(chart.locator('svg path[fill="#171717"]')).toHaveCount(2);
    await expect(chart.locator('svg path[stroke="#171717"]')).toHaveCount(0);
    const bar = chart.locator('svg path[fill="#171717"]').nth(1);
    if (info.project.name === 'mobile') await bar.tap(); else await bar.hover();
    const tooltip = chart.locator('.benchmark-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(row.label);
    await expect(tooltip).toContainText(index === 0 ? 'With Offload' : 'Selected context');
    await expect(tooltip.locator('table')).toHaveCount(0);
    for (const run of row.runs) await expect(tooltip).toContainText(Math.round(index === 0 ? run.offloadTokens / run.offloadPassed : run.afterContextChars).toLocaleString('en-US'));
    if (index === 0) await expect(tooltip).toContainText(`${row.offloadPassed}/${row.stages} checks passed`);
    const bounds = await tooltip.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(196); expect(bounds.height).toBeLessThan(140);
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(info.project.use.viewport.width);
    await chart.screenshot({ path: `test-results/benchmark-simple-tooltip-${index}-${info.project.name}.png` });
  }
});
