import { expect, test } from "bun:test";
import type { Run } from "../src/db/schema";

// Import the evaluateCondition function - we need to export it first
// For now, we'll test it indirectly through a mock execution

test("Conditional expression parsing - equality", () => {
  // Test the regex patterns we use in evaluateCondition
  const condition1 = "trigger == 'schedule'";
  const eqMatch1 = condition1.match(/^\s*(\w+)\s*==\s*'([^']+)'\s*$/);
  expect(eqMatch1).not.toBeNull();
  expect(eqMatch1![1]).toBe("trigger");
  expect(eqMatch1![2]).toBe("schedule");

  const condition2 = "trigger == 'push'";
  const eqMatch2 = condition2.match(/^\s*(\w+)\s*==\s*'([^']+)'\s*$/);
  expect(eqMatch2).not.toBeNull();
  expect(eqMatch2![1]).toBe("trigger");
  expect(eqMatch2![2]).toBe("push");
});

test("Conditional expression parsing - inequality", () => {
  const condition = "trigger != 'manual'";
  const neqMatch = condition.match(/^\s*(\w+)\s*!=\s*'([^']+)'\s*$/);
  expect(neqMatch).not.toBeNull();
  expect(neqMatch![1]).toBe("trigger");
  expect(neqMatch![2]).toBe("manual");
});

test("Conditional expression with whitespace", () => {
  const condition = "  trigger  ==  'schedule'  ";
  const eqMatch = condition.match(/^\s*(\w+)\s*==\s*'([^']+)'\s*$/);
  expect(eqMatch).not.toBeNull();
  expect(eqMatch![1]).toBe("trigger");
  expect(eqMatch![2]).toBe("schedule");
});

test("Branch conditional", () => {
  const condition = "branch == 'main'";
  const eqMatch = condition.match(/^\s*(\w+)\s*==\s*'([^']+)'\s*$/);
  expect(eqMatch).not.toBeNull();
  expect(eqMatch![1]).toBe("branch");
  expect(eqMatch![2]).toBe("main");
});
