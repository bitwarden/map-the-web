import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lintSelector,
  lintMapData,
  formatLocation,
} from "./lint-selectors.mjs";

// Shorthand: build a minimal location object for lintSelector calls
function loc(overrides = {}) {
  return {
    host: "example.com",
    category: "account-login",
    kind: "fields",
    key: "username",
    selectorIndex: 0,
    ...overrides,
  };
}

// Helpers to pull just error/warning counts from a lintSelector result
function errorsFor(selector, location) {
  return lintSelector(selector, loc(location)).errors;
}
function warningsFor(selector, location) {
  return lintSelector(selector, loc(location)).warnings;
}

// ---------------------------------------------------------------------------
// formatLocation
// ---------------------------------------------------------------------------

describe("formatLocation", () => {
  it("formats a host-level field location", () => {
    const result = formatLocation({
      host: "example.com",
      category: "account-login",
      kind: "fields",
      key: "username",
      selectorIndex: 0,
    });
    assert.equal(
      result,
      "example.com > [account-login] > fields.username > [0]",
    );
  });

  it("includes pathname when present", () => {
    const result = formatLocation({
      host: "example.com",
      pathname: "/login",
      category: "account-login",
      kind: "fields",
      key: "password",
      selectorIndex: 1,
    });
    assert.equal(
      result,
      "example.com > /login > [account-login] > fields.password > [1]",
    );
  });

  it("includes sequence index when present", () => {
    const result = formatLocation({
      host: "example.com",
      category: "account-login",
      kind: "fields",
      key: "oneTimeCode",
      selectorIndex: 0,
      seqIndex: 3,
    });
    assert.equal(
      result,
      "example.com > [account-login] > fields.oneTimeCode > sequence[3] > [0]",
    );
  });
});

// ---------------------------------------------------------------------------
// Errors: invalid CSS syntax
// ---------------------------------------------------------------------------

describe("invalid CSS syntax", () => {
  it("reports an error for an unterminated attribute selector", () => {
    const errors = errorsFor("input[name=");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Invalid CSS syntax/);
  });

  it("reports an error for an empty string segment after >>>", () => {
    // "input#x >>> " — right side is empty, caught by boundary check first
    // But "input#x >>> [" — right side is malformed CSS
    const errors = errorsFor("input#x >>> input[");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Invalid CSS syntax/);
  });
});

// ---------------------------------------------------------------------------
// Errors: universal selector
// ---------------------------------------------------------------------------

describe("universal selector", () => {
  it("reports an error for bare *", () => {
    const errors = errorsFor("*");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Universal selector/);
  });

  it("reports an error for * with a qualifier", () => {
    const errors = errorsFor("*[data-role='field']");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Universal selector/);
  });

  it("reports an error for * in a descendant chain", () => {
    const errors = errorsFor("form#login > *");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Universal selector/);
  });
});

// ---------------------------------------------------------------------------
// Errors: bare element selector
// ---------------------------------------------------------------------------

describe("bare element selector", () => {
  it("reports an error for a bare tag", () => {
    const errors = errorsFor("input");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
  });

  it("reports an error for a bare tag as the target of a descendant chain", () => {
    const errors = errorsFor("form#login > input");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
  });

  it("does not flag an element with an ID", () => {
    assert.equal(errorsFor("input#email").length, 0);
  });

  it("does not flag an element with a class", () => {
    assert.equal(errorsFor("input.username").length, 0);
  });

  it("does not flag an element with an attribute", () => {
    assert.equal(errorsFor("input[name='user']").length, 0);
  });

  it("does not flag an element with a pseudo-class", () => {
    // Pseudo-classes qualify the element (may trigger a positional warning
    // separately, but not a bare-element error)
    assert.equal(errorsFor("input:first-child").length, 0);
  });
});

// ---------------------------------------------------------------------------
// Errors: class-only selector
// ---------------------------------------------------------------------------

describe("class-only selector", () => {
  it("reports an error for a single class", () => {
    const errors = errorsFor(".submit");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Class-only selector/);
  });

  it("reports an error for multiple classes with no element", () => {
    const errors = errorsFor(".btn.primary");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Class-only selector/);
  });

  it("reports an error for a class-only target in a descendant chain", () => {
    const errors = errorsFor("form#login > .submit");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Class-only selector/);
  });

  it("does not flag a class with an element qualifier", () => {
    assert.equal(errorsFor("button.submit").length, 0);
  });

  it("does not flag a class with an attribute qualifier", () => {
    assert.equal(errorsFor(".submit[type='submit']").length, 0);
  });
});

// ---------------------------------------------------------------------------
// Errors: boundary combinator (>>>) structure
// ---------------------------------------------------------------------------

describe("boundary combinator (>>>) structure", () => {
  it("reports an error when >>> starts the selector", () => {
    const errors = errorsFor(">>> input#field");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /starts with/);
  });

  it("reports an error when >>> ends the selector", () => {
    const errors = errorsFor("iframe#frame >>>");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /ends with/);
  });

  it("does not flag valid >>> usage", () => {
    assert.equal(errorsFor("iframe#frame >>> input#field").length, 0);
  });

  it("does not flag chained >>> usage", () => {
    assert.equal(
      errorsFor("iframe#outer >>> div#shadow >>> input#field").length,
      0,
    );
  });

  it("lints each segment independently", () => {
    // Left side is fine, right side is a bare element
    const errors = errorsFor("iframe#frame >>> input");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
  });
});

// ---------------------------------------------------------------------------
// Warnings: deep nesting
// ---------------------------------------------------------------------------

describe("deep nesting", () => {
  it("warns when nesting exceeds 4 combinators", () => {
    const warnings = warningsFor(
      "div#a > div#b > div#c > div#d > div#e > input#f",
    );
    const nesting = warnings.filter((w) => /nesting/.test(w.message));
    assert.equal(nesting.length, 1);
    assert.match(nesting[0].message, /5 levels/);
  });

  it("does not warn at exactly 4 combinators", () => {
    const warnings = warningsFor("div#a > div#b > div#c > div#d > input#e");
    const nesting = warnings.filter((w) => /nesting/.test(w.message));
    assert.equal(nesting.length, 0);
  });

  it("counts descendant combinators too", () => {
    const warnings = warningsFor("div#a div#b div#c div#d div#e input#f");
    const nesting = warnings.filter((w) => /nesting/.test(w.message));
    assert.equal(nesting.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Warnings: positional pseudo-classes
// ---------------------------------------------------------------------------

describe("positional pseudo-classes", () => {
  it("warns on :nth-child", () => {
    const warnings = warningsFor("input:nth-child(2)");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /:nth-child/);
  });

  it("warns on :first-child", () => {
    const warnings = warningsFor("input:first-child");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /:first-child/);
  });

  it("warns on :last-of-type", () => {
    const warnings = warningsFor("input:last-of-type");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /:last-of-type/);
  });

  it("does not warn on functional pseudos", () => {
    const warnings = warningsFor("input:not([type='hidden'])");
    assert.equal(warnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Errors: comma-separated selector list
// ---------------------------------------------------------------------------

describe("comma-separated selector list", () => {
  it("reports an error for a top-level comma list", () => {
    const errors = errorsFor("input#a, input#b");
    const commaErrors = errors.filter((e) =>
      /Comma-separated selector list/.test(e.message),
    );
    assert.equal(commaErrors.length, 1);
  });

  it("reports the comma error once regardless of how many alternatives", () => {
    const errors = errorsFor("input#a, input#b, input#c");
    const commaErrors = errors.filter((e) =>
      /Comma-separated selector list/.test(e.message),
    );
    assert.equal(commaErrors.length, 1);
  });

  it("does not flag a comma inside an attribute value", () => {
    const errors = errorsFor("input[data-tags='one,two']");
    assert.equal(errors.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Errors: pseudo-elements
// ---------------------------------------------------------------------------

describe("pseudo-elements", () => {
  it("reports an error for ::before", () => {
    const errors = errorsFor("input::before");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Pseudo-element/);
    assert.match(errors[0].message, /::before/);
  });

  it("reports an error for ::placeholder", () => {
    const errors = errorsFor("input::placeholder");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /::placeholder/);
  });

  it("reports an error for ::after", () => {
    const errors = errorsFor("input::after");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /::after/);
  });

  it("reports a single pseudo-element error for a bare ::before", () => {
    const errors = errorsFor("::before");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Pseudo-element/);
    assert.match(errors[0].message, /::before/);
  });
});

// ---------------------------------------------------------------------------
// Errors: at-rule tokens
// ---------------------------------------------------------------------------

describe("at-rule tokens", () => {
  it("reports an error for @media", () => {
    const errors = errorsFor("@media screen");
    const atRuleErrors = errors.filter((e) => /At-rule token/.test(e.message));
    assert.equal(atRuleErrors.length, 1);
    assert.match(atRuleErrors[0].message, /@media/);
  });

  it("reports an error for @keyframes", () => {
    const errors = errorsFor("@keyframes fade");
    const atRuleErrors = errors.filter((e) => /At-rule token/.test(e.message));
    assert.equal(atRuleErrors.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Errors: namespace separator
// ---------------------------------------------------------------------------

describe("namespace separator", () => {
  it("reports an error for a named namespace prefix on a tag", () => {
    const errors = errorsFor("svg|rect");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 1);
    assert.match(nsErrors[0].message, /svg\|rect/);
  });

  it("reports an error for a redundant html| prefix", () => {
    const errors = errorsFor("html|input");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 1);
    assert.match(nsErrors[0].message, /html\|input/);
  });

  it("reports an error for the wildcard namespace (*|foo)", () => {
    const errors = errorsFor("*|foo");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 1);
    assert.match(nsErrors[0].message, /\*\|foo/);
  });

  it("reports an error for the empty namespace (|foo)", () => {
    const errors = errorsFor("|foo");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 1);
  });

  it("reports an error for a namespaced attribute selector", () => {
    const errors = errorsFor("input[html|lang]");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 1);
    assert.match(nsErrors[0].message, /\[html\|lang\]/);
  });

  it("does not flag a selector without namespace prefixes", () => {
    const errors = errorsFor("input[lang='en']");
    const nsErrors = errors.filter((e) =>
      /Namespace-qualified token/.test(e.message),
    );
    assert.equal(nsErrors.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Warnings: sibling combinators
// ---------------------------------------------------------------------------

describe("sibling combinators", () => {
  it("warns on the adjacent sibling combinator (+)", () => {
    const warnings = warningsFor("input#a + button#b");
    const siblingWarnings = warnings.filter((w) =>
      /Sibling combinator/.test(w.message),
    );
    assert.equal(siblingWarnings.length, 1);
    assert.match(siblingWarnings[0].message, /\+/);
  });

  it("warns on the general sibling combinator (~)", () => {
    const warnings = warningsFor("input#a ~ button#b");
    const siblingWarnings = warnings.filter((w) =>
      /Sibling combinator/.test(w.message),
    );
    assert.equal(siblingWarnings.length, 1);
    assert.match(siblingWarnings[0].message, /~/);
  });

  it("does not warn on descendant or child combinators", () => {
    const descendant = warningsFor("form#login input#email").filter((w) =>
      /Sibling combinator/.test(w.message),
    );
    const child = warningsFor("form#login > input#email").filter((w) =>
      /Sibling combinator/.test(w.message),
    );
    assert.equal(descendant.length, 0);
    assert.equal(child.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Warnings: state-dependent pseudo-classes
// ---------------------------------------------------------------------------

describe("state-dependent pseudo-classes", () => {
  it("warns on :focus", () => {
    const warnings = warningsFor("input#email:focus");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
    assert.match(stateWarnings[0].message, /:focus/);
  });

  it("warns on :hover", () => {
    const warnings = warningsFor("button#go:hover");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :checked", () => {
    const warnings = warningsFor("input#agree:checked");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :required", () => {
    const warnings = warningsFor("input#email:required");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :disabled", () => {
    const warnings = warningsFor("input#email:disabled");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("does not warn on positional pseudos (distinct warning family)", () => {
    const warnings = warningsFor("input#email:first-child");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 0);
  });

  it("warns on :modal", () => {
    const warnings = warningsFor("dialog#confirm:modal");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :open", () => {
    const warnings = warningsFor("details#faq:open");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :popover-open", () => {
    const warnings = warningsFor("div#menu:popover-open");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });

  it("warns on :fullscreen", () => {
    const warnings = warningsFor("video#player:fullscreen");
    const stateWarnings = warnings.filter((w) =>
      /State-dependent pseudo-class/.test(w.message),
    );
    assert.equal(stateWarnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Errors: root / shadow-root pseudo-classes
// ---------------------------------------------------------------------------

describe("root / shadow-root pseudo-classes", () => {
  it("reports an error for :host", () => {
    const errors = errorsFor(":host");
    const rootErrors = errors.filter((e) =>
      /Root-context pseudo-class/.test(e.message),
    );
    assert.equal(rootErrors.length, 1);
    assert.match(rootErrors[0].message, /:host/);
  });

  it("reports an error for :host() with an argument", () => {
    const errors = errorsFor(":host(.login)");
    const rootErrors = errors.filter((e) =>
      /Root-context pseudo-class/.test(e.message),
    );
    assert.equal(rootErrors.length, 1);
  });

  it("reports an error for :host-context()", () => {
    const errors = errorsFor(":host-context(main)");
    const rootErrors = errors.filter((e) =>
      /Root-context pseudo-class/.test(e.message),
    );
    assert.equal(rootErrors.length, 1);
  });

  it("reports an error for :root", () => {
    const errors = errorsFor(":root input#email");
    const rootErrors = errors.filter((e) =>
      /Root-context pseudo-class/.test(e.message),
    );
    assert.equal(rootErrors.length, 1);
    assert.match(rootErrors[0].message, /:root/);
  });
});

// ---------------------------------------------------------------------------
// Warnings: context-dependent pseudo-classes
// ---------------------------------------------------------------------------

describe("context-dependent pseudo-classes", () => {
  it("warns on :scope", () => {
    const warnings = warningsFor(":scope > input#email");
    const ctxWarnings = warnings.filter((w) =>
      /Context-dependent pseudo-class/.test(w.message),
    );
    assert.equal(ctxWarnings.length, 1);
    assert.match(ctxWarnings[0].message, /:scope/);
  });

  it("warns on :lang()", () => {
    const warnings = warningsFor("input#email:lang(en)");
    const ctxWarnings = warnings.filter((w) =>
      /Context-dependent pseudo-class/.test(w.message),
    );
    assert.equal(ctxWarnings.length, 1);
    assert.match(ctxWarnings[0].message, /:lang/);
  });

  it("warns on :dir()", () => {
    const warnings = warningsFor("input#email:dir(ltr)");
    const ctxWarnings = warnings.filter((w) =>
      /Context-dependent pseudo-class/.test(w.message),
    );
    assert.equal(ctxWarnings.length, 1);
  });

  it("warns on :defined", () => {
    const warnings = warningsFor("custom-input#email:defined");
    const ctxWarnings = warnings.filter((w) =>
      /Context-dependent pseudo-class/.test(w.message),
    );
    assert.equal(ctxWarnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Warnings: ID-only target
// ---------------------------------------------------------------------------

describe("ID-only target", () => {
  it("warns on a single ID with no element type", () => {
    const warnings = warningsFor("#email");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /ID-only selector/);
  });

  it("warns on an ID-only target at the end of a descendant chain", () => {
    const warnings = warningsFor("form#login > #email");
    const idOnly = warnings.filter((w) => /ID-only selector/.test(w.message));
    assert.equal(idOnly.length, 1);
  });

  it("does not warn when an element type qualifies the ID", () => {
    const warnings = warningsFor("input#email");
    assert.equal(warnings.length, 0);
  });

  it("does not warn when a class qualifies the ID", () => {
    const warnings = warningsFor("#email.primary");
    assert.equal(warnings.length, 0);
  });

  it("does not warn when an attribute qualifies the ID", () => {
    const warnings = warningsFor("#email[type='email']");
    assert.equal(warnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Warnings: selector length
// ---------------------------------------------------------------------------

describe("selector length", () => {
  it("warns when selector exceeds 200 characters", () => {
    const long = "div#" + "a".repeat(197);
    assert.ok(long.length > 200);
    const warnings = warningsFor(long);
    const length = warnings.filter((w) => /characters long/.test(w.message));
    assert.equal(length.length, 1);
  });

  it("does not warn at exactly 200 characters", () => {
    const exact = "div#" + "a".repeat(196);
    assert.equal(exact.length, 200);
    const warnings = warningsFor(exact);
    const length = warnings.filter((w) => /characters long/.test(w.message));
    assert.equal(length.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Warnings: duplicates
// ---------------------------------------------------------------------------

describe("duplicate selectors", () => {
  it("warns on duplicate selectors within a field's selector array", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              fields: {
                username: ["input#user", "input#user"],
              },
            },
          ],
        },
      },
    };
    const { warnings } = lintMapData(data);
    const dupes = warnings.filter((w) => /Duplicate/.test(w.message));
    assert.equal(dupes.length, 1);
  });

  it("warns on duplicates within a selector sequence", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              fields: {
                oneTimeCode: [["input#otp-0", "input#otp-1", "input#otp-0"]],
              },
            },
          ],
        },
      },
    };
    const { warnings } = lintMapData(data);
    const dupes = warnings.filter((w) => /Duplicate/.test(w.message));
    assert.equal(dupes.length, 1);
  });

  it("does not warn on the same selector in different fields", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              fields: {
                username: ["input#shared"],
                email: ["input#shared"],
              },
            },
          ],
        },
      },
    };
    const { warnings } = lintMapData(data);
    const dupes = warnings.filter((w) => /Duplicate/.test(w.message));
    assert.equal(dupes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// lintMapData: structure traversal
// ---------------------------------------------------------------------------

describe("lintMapData traversal", () => {
  it("returns no issues for valid selectors", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              container: ["form#login"],
              fields: {
                username: ["input#user"],
                password: ["input#pass"],
              },
              actions: {
                submit: ["button#go"],
              },
            },
          ],
        },
      },
    };
    const { errors, warnings } = lintMapData(data);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it("lints selectors under pathnames", () => {
    const data = {
      hosts: {
        "example.com": {
          pathnames: {
            "/login": {
              forms: [
                {
                  category: "account-login",
                  fields: { username: ["input"] },
                },
              ],
            },
          },
        },
      },
    };
    const { errors } = lintMapData(data);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
    assert.match(errors[0].location, /\/login/);
  });

  it("skips null host entries", () => {
    const data = {
      hosts: {
        "example.com": null,
      },
    };
    const { errors, warnings } = lintMapData(data);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it("skips null pathname entries", () => {
    const data = {
      hosts: {
        "example.com": {
          pathnames: {
            "/irrelevant": null,
          },
        },
      },
    };
    const { errors, warnings } = lintMapData(data);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it("lints container selectors", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              container: [".wrapper"],
              fields: { username: ["input#user"] },
            },
          ],
        },
      },
    };
    const { errors } = lintMapData(data);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Class-only selector/);
    assert.match(errors[0].location, /container\.container/);
  });

  it("lints action selectors", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              fields: { username: ["input#user"] },
              actions: { submit: ["button"] },
            },
          ],
        },
      },
    };
    const { errors } = lintMapData(data);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
    assert.match(errors[0].location, /actions\.submit/);
  });

  it("lints selector sequences in composite arrays", () => {
    const data = {
      hosts: {
        "example.com": {
          forms: [
            {
              category: "account-login",
              fields: {
                oneTimeCode: [["input", "input#otp-1"]],
              },
            },
          ],
        },
      },
    };
    const { errors } = lintMapData(data);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Bare element selector/);
    assert.match(errors[0].location, /sequence\[0\]/);
  });

  it("returns empty results when hosts is absent", () => {
    const { errors, warnings } = lintMapData({});
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Clean selectors: no false positives
// ---------------------------------------------------------------------------

describe("clean selectors produce no issues", () => {
  const clean = [
    "input#email",
    "input[name='user']",
    "input.email-field",
    "button#submit-btn",
    "button[type='submit']",
    "form#login",
    "form[action='/login']",
    "div.container input#email",
    "iframe#frame >>> input#field",
    "iframe#outer >>> div#shadow-host >>> input#field",
    "div#shadow-host >>> form#login > input#email",
  ];

  for (const selector of clean) {
    it(`passes: ${selector}`, () => {
      const { errors, warnings } = lintSelector(selector, loc());
      assert.equal(errors.length, 0, `unexpected error: ${errors[0]?.message}`);
      assert.equal(
        warnings.length,
        0,
        `unexpected warning: ${warnings[0]?.message}`,
      );
    });
  }
});
