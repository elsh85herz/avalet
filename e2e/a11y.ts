import type { Page } from "@playwright/test";

export type ContrastFailure = { text: string; ratio: number; required: number; color: string; background: string };

/**
 * WCAG 2.1 contrast of every visible piece of text on the page against its
 * effective background (translucent layers composited over the page
 * background). Disabled controls and placeholder-only content are exempt,
 * as in WCAG.
 */
export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const parse = (value: string): RGBA => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const lum = ([r, g, b]: RGBA) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const pageBg = parse(getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
    const background = (el: Element | null): RGBA => {
      const layers: RGBA[] = [];
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const bg = parse(style.backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
      }
      let result: RGBA = [...pageBg.slice(0, 3), 1] as RGBA;
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };
    const failures: ContrastFailure[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      if (el.closest("button:disabled, input:disabled, select:disabled, [aria-disabled='true']")) continue;
      if (el.closest("option")) continue;
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      if (opacity < 0.5) continue; // deliberately faded (e.g. disabled look)
      const bg = background(el);
      const fg = over(parse(style.color), bg);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const required = large ? 3 : 4.5;
      const r = ratio(fg, bg);
      if (r < required) {
        failures.push({ text: text.slice(0, 50), ratio: Math.round(r * 100) / 100, required, color: style.color, background: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})` });
      }
    }
    return failures;
  });
}
