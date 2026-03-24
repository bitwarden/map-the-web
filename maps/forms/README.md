# Forms Map

The Forms Map (`forms.jsonc`) describes the locations of form fields on web pages
using CSS selectors. It enables consuming applications to locate specific fields
without relying on heuristic determinations or page-specific detection logic.

This Map describes **the content of a page**. It does not prescribe or imply how
a consumer of this Map should behave. Additionally, the term "form" here
describes the user-facing concept, which may or may not utilize the HTML `form`
tag. See the project [README](../../README.md) for broader mapping philosophies.

- [Forms Map](#forms-map)
  - [Limitations](#limitations)
  - [Data Structure Overview](#data-structure-overview)
  - [Host Keys](#host-keys)
    - [The `www` subdomain](#the-www-subdomain)
    - [Ports](#ports)
  - [Pathnames](#pathnames)
    - [Entry Hierarchy](#entry-hierarchy)
    - [Trailing Slashes](#trailing-slashes)
  - [Forms](#forms)
    - [Multiple Forms](#multiple-forms)
    - [Category](#category)
  - [Selectors](#selectors)
    - [Selector Arrays](#selector-arrays)
    - [Boundary-Crossing Selectors (`>>>`)](#boundary-crossing-selectors-)
      - [Shadow DOM](#shadow-dom)
      - [Iframes](#iframes)
  - [Null and Empty Semantics](#null-and-empty-semantics)
  - [Authoring Guidelines](#authoring-guidelines)

## Limitations

There is presently no mechanism embedded within Forms Map data for:

- describing the age of individual host entries
- annotating entries (descriptions of why a particular selector is needed, etc.)
- form rendering timings
- distinguishing URLs by query string and/or fragment which affect rendered form content
- describing dynamically-renamed fields (e.g. sites that randomize attribute values on each render)
- form inputs that represent user confirmation (e.g. agree to terms of service, etc)
- indicators of irrelevant data at the form field level

## Data Structure Overview

```json
{
  "version": "1.0.0",
  "hosts": {
    "<host>": {
      "forms": [ ... ],           // optional — site-wide fallback
      "pathnames": {              // optional
        "<pathname>": {
          "forms": [ ... ]
        },
        "<pathname>": null        // signals this page should be skipped
      }
    },
    "<host>": null                // signals all pages on this host should be skipped
  }
}
```

A complex entry may look like:

```json
{
  "version": "1.0.0",
  "hosts": {
    "example.com": {
      "forms": [
        {
          "category": "account-login",
          "selectors": {
            "username": ["input#email"],
            "password": ["input#pass"]
          }
        }
      ],
      "pathnames": {
        "/register": {
          "forms": [
            {
              "category": "account-creation",
              "selectors": {
                "username": ["input#reg-email"],
                "password": ["input#reg-password"]
              }
            }
          ]
        },
        "/spreadsheets": null
      }
    }
  }
}
```

## Host Keys

The required top-level `hosts` object contains all host entries in the Map. An
empty `hosts` object (`{}`) is valid and represents a Map with no entries.

Each key in the `hosts` object is a **host**: a hostname, or a hostname with a
port when a non-default port is used. Do not include the protocol, path, query
string, or fragment. Do not include default ports such as `443` and `80`.

```json
{
  "hosts": {
    "example.com": { ... },
    "login.subdomain.example.com": { ... },
    "example.com:1234": { ... }
  }
}
```

Host keys are **exact-match only**. There is no wildcard, suffix, or domain
inheritance:

- `example.com` and `example.com:8443` are separate entries with no inheritance
  between them
- A rule for `example.com` does **not** apply to `sub.example.com`

Populated host key values **must** be objects with `forms` and/or `pathnames`
keys with valid values. Use a `null` value to authoritatively indicate when
there are no relevant forms across the host's pages. See also:
[Null and Empty Semantics](#null-and-empty-semantics)

### The `www` subdomain

Many sites serve identical content on both `example.com` and `www.example.com`.
To avoid redundant entries, author host keys under the non-`www` entry as
canonical. Do not add a separate `www.` entry unless the site differs at the
`www` subdomain. When no explicit `www.` entry exists, consumers should treat a
`www.` URL as equivalent to its non-`www.` counterpart for lookup.

### Ports

Include the port in the key **only** when it is non-default. Default ports
(`:443` for HTTPS, `:80` for HTTP) are stripped by standard URL parsers
(`URL.host`) and should not appear in keys.

| URL                        | Key                                |
| -------------------------- | ---------------------------------- |
| `https://example.com`      | `example.com`                      |
| `https://example.com:443`  | `example.com` (default port, omit) |
| `https://example.com:8443` | `example.com:8443`                 |
| `http://example.com:3000`  | `example.com:3000`                 |
| `http://example.com:80`    | `example.com` (default port, omit) |

## Pathnames

The `pathnames` object maps URL pathnames to page-specific entries. Pathnames
must start with `/`.

```json
{
  "version": "1.0.0",
  "hosts": {
    "example.com": {
      "forms": [
        {
          "selectors": {
            "username": ["input#user"],
            "password": ["input#pass"]
          }
        }
      ],
      "pathnames": {
        "/login": {
          "forms": [
            {
              "selectors": {
                "username": ["input#login-email"],
                "password": ["input#login-pass"]
              }
            }
          ]
        },
        "/spreadsheets": null
      }
    }
  }
}
```

The `pathnames` property value should only be represented by a valid data-rich
object (empty values would have the same meaning as excluding the `pathnames`
property altogether).

Empty objects (`{}`) should not be used for pathname key values; use `null` to
authoritatively indicate when the page is irrelevant to the forms concern. See
also: [Null and Empty Semantics](#null-and-empty-semantics)

### Entry Hierarchy

When resolving entry hierarchy for a URL:

1. **Exact pathname match**: If the URL's pathname matches a key in `pathnames`,
   that entry should be considered the most relevant description of the URL.
2. **Host fallback**: If no pathname matches, the host-level `forms` should be
   considered the most relevant description of the URL.

Pathname entries fully override the host entry values. They do not "merge" with
them.

### Trailing Slashes

Pathname keys should omit trailing slashes. Consumers are expected to normalize
trailing slashes before lookup (e.g. `/login/` becomes `/login`). The root path
is always `/`.

For forms that **only** appear on the domain's root page, use `"/"` as the
pathname key with no host-level `forms` fallback:

```json
{
  "hosts": {
    "example.com": {
      "pathnames": {
        "/": {
          "forms": [
            {
              "category": "account-login",
              "selectors": {
                "username": ["input#email"],
                "password": ["input#pass"]
              }
            }
          ]
        }
      }
    }
  }
}
```

## Forms

Each entry in a `forms` array describes one logical form on a page. "Form" here
refers to the user-facing concept of a form — a group of related input fields —
and does not require a literal HTML `<form>` element.

```json
{
  "forms": [
    {
      "category": "account-login",
      "selectors": {
        "username": ["input#email"],
        "password": ["input#password"]
      }
    }
  ]
}
```

`forms` should never be empty; it should only be present as a valid and
populated array. See also: [Null and Empty Semantics](#null-and-empty-semantics)

### Multiple Forms

A page may have more than one logical form. Each gets its own entry in the
`forms` array. Common reasons for multiple entries include:

- **Mixed form types** — e.g. a login form and a registration form on the same
  page
- **Multivariate layouts** — A/B tests or feature flags that change which form
  appears
- **Multi-step flows** — Single-page applications where different forms render
  at the same URL

```json
{
  "forms": [
    {
      "category": "account-login",
      "selectors": {
        "username": ["#login-email"],
        "password": ["#login-pass"]
      }
    },
    {
      "category": "account-creation",
      "selectors": {
        "username": ["#register-email"],
        "password": ["#register-pass"]
      }
    }
  ]
}
```

### Category

The optional `category` field describes the form's purpose. Consumers may use
this to enrich the context of their actions (e.g. skip forms that are not
relevant to their concerns).

| Category           | Description                                        |
| ------------------ | -------------------------------------------------- |
| `account-creation` | New account registration                           |
| `account-login`    | Sign-in / authentication                           |
| `account-recovery` | Password reset, recovery codes, etc.               |
| `account-update`   | Change email address, change or set a new password |
| `address`          | Physical / mailing address                         |
| `identity`         | Personal identity information (name, DOB, etc.)    |
| `payment-card`     | Credit/debit card payment                          |
| `search`           | Search form                                        |
| `subscribe`        | Newsletter or email list signup                    |

When `category` is omitted, the form's purpose is unspecified. Consumers should
not infer purpose from the absence of a category.

## Selectors

The `selectors` object maps keys to arrays of CSS selectors. Each key is an
opaque identifier whose meaning is defined by the consuming application. The Map
itself assigns no semantics to selector keys — they serve as labels that
consumers use to associate selectors with their own field types.

```json
{
  "selectors": {
    "username": ["input#email", "input[name='login']"],
    "password": ["input#password"],
    "form": ["form#login-form"]
  }
}
```

### Selector Arrays

Each selector key maps to an array of one or more CSS selectors. The array
conveys cases where that concern may be represented in multiple ways (different
locations, repeat inputs for user confirmation, etc.). The presence of multiple
selectors does not imply how a consumer should make use of them (e.g. use all or
only the first found). Additionally, the _order_ of selectors does not imply
precedence.

> [!IMPORTANT]
> Cases where input selectors are mutually-exclusive should be represented within independent `forms` array entries.

```json
{
  "username": [
    "input#specific-email-field",
    "form.login input[type='email']",
    "input[autocomplete='username']"
  ]
}
```

### Boundary-Crossing Selectors (`>>>`)

The `>>>` combinator represents a boundary crossing from a host element into
nested content that standard CSS selectors cannot reach. The segments between
`>>>` are standard CSS selectors. Each `>>>` represents one boundary crossing.

> [!IMPORTANT]
> The `>>>` combinator is not a standard CSS combinator; it is a
> convention used by this project. Consumers are responsible for implementing
> the appropriate traversal when encountering this combinator.

The boundary type is determined by the element matched before `>>>`:

- **No `iframe` tag** in the preceding segment → shadow DOM boundary
- **`iframe` tag** in the preceding segment → iframe boundary

#### Shadow DOM

When `>>>` follows a non-iframe element, it indicates a transition from a shadow
host into its shadow root's content
([MDN docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)).

```json
{
  "username": ["#host-element >>> form > input[name='username']"]
}
```

For nested shadow roots:

```json
{
  "username": ["#outer-host >>> #inner-host >>> input[name='user']"]
}
```

#### Iframes

When `>>>` follows a selector that includes the `iframe` tag, it indicates a
transition into the iframe's content document. The `iframe` tag **must** be
present in the preceding selector segment so that consumers can determine the
boundary type from the selector alone.

```json
{
  "username": ["iframe#login-frame >>> input[name='username']"]
}
```

Mixed boundary types compose naturally:

```json
{
  "username": ["iframe.auth >>> div#my-shadow-host >>> input[name='user']"]
}
```

> [!TIP]
> Remember, `iframes` [cannot be a shadow host](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow#elements_you_can_attach_a_shadow_to).

## Null and Empty Semantics

The presence or absence of entries carries meaning. This table summarizes the
interpretation at each level:

| Location             | Value   | Meaning                                                                |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| Host key             | `null`  | All pages on this host are irrelevant to the forms concern             |
| Host key             | omitted | No forms information about this host                                   |
| `forms` (host-level) | omitted | No forms information that applies site-wide                            |
| `pathnames`          | omitted | No page-specific forms information                                     |
| Pathname key         | `null`  | This specific page is irrelevant to the forms concern                  |
| Pathname key         | omitted | No information about this page; host-level `forms` information applies |

The distinction between "irrelevant" and "no information" is important. An
"irrelevant" signal indicates the page was evaluated and deliberately excluded
(a consumer may use this signal to skip form detection heuristics, for example).
"No information" means the page has not been mapped or mapping is unnecessary.

## Authoring Guidelines

1. **Test your selectors.** Open the target page in a browser, open DevTools,
   and verify each selector with `document.querySelector()`.

2. **Target the rendered state.** Selectors should match elements in their final
   rendered form, not necessarily the initial HTML. Many sites load form fields
   dynamically via JavaScript; test selectors after the page has fully loaded.
   Consumers are responsible for their own timing strategy (e.g. polling,
   MutationObserver) when elements are not immediately present.

3. **Be specific.** Prefer ID-based or attribute-based selectors over positional
   ones (`:nth-child`, tag-only). Specific selectors are more resilient to page
   layout changes.

4. **Use `>>>` only when necessary.** Only use boundary-crossing selectors when
   the target element is actually inside a shadow root or iframe.

5. **Skip intentionally.** Use `null` on pages where mapping is deliberately
   absent (e.g. search pages, pages with no relevant forms).

6. **Avoid redundancy.** If all pages on a host use the same form, put it in
   host-level `forms` and omit `pathnames`. Only add pathname entries for pages
   that differ.

7. **Keep pathnames exact.** Pathname keys must exactly match the URL path.
   Wildcards and pattern matching are not supported.

8. **Treat hosts as exact matches.** `example.com`, `subdomain.example.com`, and
   `example.com:8443` are different host keys. Author entries under the
   non-`www` host as canonical; only add a separate `www.` entry if its forms
   differ from the non-`www` counterpart (see
   [The `www` subdomain](#the-www-subdomain)).

9. **Omit what you don't need.** If a host has no site-wide fallback, omit
   `forms`. If there are no page-specific entries, omit `pathnames`.

10. **Remove stale entries.** If a site updates to use standard mechanisms (e.g.
    `autocomplete` attributes) that make the Map entry unnecessary, remove it.
    Maps are a stopgap, not a permanent fixture.

11. **Document non-obvious selectors.** If a selector targets an element through
    an unusual DOM structure (deeply nested shadow roots, dynamically injected
    containers), add context in the change pull request explaining why that path
    is necessary.
