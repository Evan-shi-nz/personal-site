import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContributions } from "../worker/github.js";

// Shape of github.com/users/<name>/contributions (attributes in GitHub's current order).
const html = `
<h2 class="f4 text-normal mb-2">
      1,234
      contributions
        in the last year
  </h2>
<table><tbody><tr>
<td tabindex="0" data-ix="0" aria-selected="false" style="width: 10px" data-date="2026-11-08" id="contribution-day-component-0-52" data-level="0" role="gridcell" class="ContributionCalendar-day"></td>
<td tabindex="0" data-ix="1" aria-selected="false" style="width: 10px" data-date="2026-11-09" id="contribution-day-component-1-52" data-level="3" role="gridcell" class="ContributionCalendar-day"></td>
<td data-level="1" data-date="2026-11-10" id="contribution-day-component-2-52" class="ContributionCalendar-day"></td>
</tr></tbody></table>
<tool-tip id="tooltip-a" for="contribution-day-component-0-52" popover="manual" data-direction="n" role="tooltip">No contributions on November 8th.</tool-tip>
<tool-tip id="tooltip-b" for="contribution-day-component-1-52" popover="manual" data-direction="n" role="tooltip">12 contributions on November 9th.</tool-tip>
<tool-tip id="tooltip-c" for="contribution-day-component-2-52" popover="manual" data-direction="n" role="tooltip">1 contribution on November 10th.</tool-tip>`;

test("parses days, levels, counts and the yearly total", () => {
  const r = parseContributions(html);
  assert.equal(r.total, 1234);
  assert.deepEqual(r.days, [
    { date: "2026-11-08", level: 0, count: 0 },
    { date: "2026-11-09", level: 3, count: 12 },
    { date: "2026-11-10", level: 1, count: 1 },
  ]);
});

test("returns no days for an unexpected page", () => {
  assert.deepEqual(parseContributions("<html>rate limited</html>").days, []);
});
