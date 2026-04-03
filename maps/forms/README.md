# Forms Map

The Forms Map (`forms.jsonc`) describes the locations of form fields on web pages
using CSS selectors. It enables consuming applications to locate specific fields
without relying on heuristic determinations or page-specific detection logic.

This Map describes **the content of a page**. It does not prescribe or imply how
a consumer of this Map should behave. Additionally, the term "form" here
describes the user-facing concept of users supplying data to a website, which
may or may not utilize the HTML `form` tag. See the project
[README](../../README.md) for broader mapping philosophies.

- [Forms Map](#forms-map)
  - [Limitations](#limitations)
  - [Data Structure Overview](#data-structure-overview)
  - [Host Keys](#host-keys)
    - [Internationalized Domain Names](#internationalized-domain-names)
    - [The `www` subdomain](#the-www-subdomain)
    - [Ports](#ports)
  - [Pathnames](#pathnames)
    - [Entry Hierarchy](#entry-hierarchy)
    - [Trailing Slashes](#trailing-slashes)
  - [Forms](#forms)
    - [Multiple Forms](#multiple-forms)
    - [Category](#category)
  - [Container](#container)
  - [Fields](#fields)
    - [Field Keys](#field-keys)
      - [Authentication](#authentication)
      - [Name](#name)
      - [Contact](#contact)
      - [Address](#address)
      - [Birthdate](#birthdate)
      - [Payment Card](#payment-card)
      - [Consent](#consent)
      - [Search](#search)
    - [Selector Arrays](#selector-arrays)
      - [Selector Sequences](#selector-sequences)
    - [Boundary-Crossing Selectors (`>>>`)](#boundary-crossing-selectors-)
      - [Shadow DOM](#shadow-dom)
      - [Iframes](#iframes)
  - [Actions](#actions)
  - [Null and Empty Semantics](#null-and-empty-semantics)
  - [Authoring Guidelines](#authoring-guidelines)

## Limitations

There is presently no mechanism embedded within the Forms Map for:

- describing the age of individual host entries
- annotating entries (descriptions of why a particular selector is needed, etc.)
- form rendering timings
- distinguishing URLs by query string and/or fragment that affect rendered form content
- describing dynamically-renamed fields (e.g. sites that randomize attribute values on each render)
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
          "container": ["form#login-form"],
          "fields": {
            "username": ["input#email"],
            "password": ["input#pass"]
          },
          "actions": {
            "submit": ["button[type='submit']"]
          }
        }
      ],
      "pathnames": {
        "/register": {
          "forms": [
            {
              "category": "account-creation",
              "fields": {
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
- An entry describing `example.com` does **not** apply to `sub.example.com`
  (with the potential exception of [www](#the-www-subdomain))

Populated host key values **must** be objects with `forms` and/or `pathnames`
keys with valid values. Use a `null` value to authoritatively indicate when
there are no relevant forms across the host's pages. See also:
[Null and Empty Semantics](#null-and-empty-semantics)

### Internationalized Domain Names

Internationalized domain names (IDNs) should be authored using their Unicode form,
not Punycode.

Unicode host keys are normalized to Punycode (ASCII) at build time, ensuring
that consumers of the built Maps will receive ASCII keys:

- `münchen.de` → built as `xn--mnchen-3ya.de`
- `例え.jp` → built as `xn--r8jz45g.jp`

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
          "fields": {
            "username": ["input#user"],
            "password": ["input#pass"]
          }
        }
      ],
      "pathnames": {
        "/login": {
          "forms": [
            {
              "fields": {
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
              "fields": {
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
      "container": ["form#login-form"],
      "fields": {
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
      "fields": {
        "username": ["#login-email"],
        "password": ["#login-pass"]
      }
    },
    {
      "category": "account-creation",
      "fields": {
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
| `signup`           | Newsletter, sweepstakes, unsubscribe, or general contact signup (not account creation) |

When `category` is omitted, the form's purpose is unspecified. Consumers should
not infer purpose from the absence of a category.

## Container

The optional `container` property is a selector array identifying the form's
container element on the page. This is used to scope the form's fields and
actions within the page, and does not require referencing a literal HTML `<form>` element.

```json
{
  "container": ["form#login-form"],
  "fields": {
    "username": ["input#email"],
    "password": ["input#password"]
  }
}
```

## Fields

The `fields` object maps keys to arrays of CSS selectors. Each key identifies
the **user data concept** that a form field captures. A consumer should be
able to determine what value belongs in the field from the key name and form
[category](#category) alone.

```json
{
  "fields": {
    "username": ["input#email", "input[name='login']"],
    "password": ["input#password"]
  }
}
```

### Field Keys

Field keys are constrained to the following set. Keys are grouped here for
readability; the groupings carry no semantic meaning in the schema.

#### Authentication

| Key | Description |
| --- | --- |
| `username` | Username or login identifier |
| `password` | Current password |
| `newPassword` | New or confirmation password |
| `oneTimeCode` | One-time verification code (SMS, email, authenticator, etc.) |

#### Name

Where a form collects name data as a single field, use `fullName`. Where it
collects name components separately, use the individual keys.

| Key | Description |
| --- | --- |
| `fullName` | Full name (single combined field) |
| `honorificPrefix` | Title or honorific prefix (Mr., Dr., etc.) |
| `firstName` | Given name |
| `middleName` | Middle or additional name |
| `lastName` | Family name |
| `honorificSuffix` | Suffix (Jr., PhD., etc.) |

#### Contact

Where a form collects a phone number as a single field, use `phone`. Where it
collects phone components separately, use the individual keys.

| Key | Description |
| --- | --- |
| `email` | Email address |
| `phone` | Full telephone number (single combined field) |
| `phoneCountryCode` | Country code (e.g. "1", "44") |
| `phoneAreaCode` | Area code |
| `phoneLocal` | Local number (without country or area code) |
| `phoneExtension` | Extension number |
| `organization` | Company, organization, or institution |

#### Address

Street address data may appear as a single multi-line field (e.g. a `<textarea>`)
or as separate address lines. Use `streetAddress` for the combined form and
`addressLine*` for individual lines.

Administrative divisions use an abstract leveling system to accommodate
international variation. Each level represents a progressively finer geographic
subdivision:

| Key | Description | Examples |
| --- | --- | --- |
| `streetAddress` | Full street address (multi-line block) | — |
| `addressLine1` | First line of street address | — |
| `addressLine2` | Second line of street address | — |
| `addressLine3` | Third line of street address | — |
| `addressLevel1` | Broadest administrative division | State, province, prefecture, canton, county, region |
| `addressLevel2` | Locality | City, town, village, municipality |
| `addressLevel3` | Sub-locality | District, suburb, ward, borough |
| `addressLevel4` | Finest-grained subdivision | Block, neighborhood section |
| `postalCode` | ZIP or postal code | — |
| `country` | Country or territory | — |

> [!NOTE]
> Not all countries use all four address levels. Most forms will only need
> `addressLevel1` (state/province) and `addressLevel2` (city). Use only the
> levels that correspond to actual fields on the form.

#### Birthdate

Where a form collects a birthdate as a single field, use `birthdate`. Where it
collects date components separately, use the individual keys.

| Key | Description |
| --- | --- |
| `birthdate` | Full birth date (single combined field) |
| `birthdateDay` | Day component |
| `birthdateMonth` | Month component |
| `birthdateYear` | Year component |

#### Payment Card

| Key | Description |
| --- | --- |
| `cardholderName` | Name as printed on card |
| `cardNumber` | Card number |
| `cardExpirationDate` | Combined expiration (single field; e.g. MM/YY) |
| `cardExpirationMonth` | Expiration month |
| `cardExpirationYear` | Expiration year |
| `cardCvv` | Security code (CVV / CVC / CSC) |
| `cardType` | Card network or brand (Visa, Mastercard, etc.) |

> [!IMPORTANT]
> A combined expiration field (`cardExpirationDate`) is not the same as separate
> month and year fields (`cardExpirationMonth` / `cardExpirationYear`). Use the
> key that matches the actual input structure on the page.

#### Consent

| Key | Description |
| --- | --- |
| `consentTerms` | Terms of service or terms and conditions acceptance |
| `consentPrivacy` | Privacy policy acceptance |
| `consentUser` | General user confirmation (e.g. "I agree", "I confirm") |

#### Search

| Key | Description |
| --- | --- |
| `searchTerm` | Free-text search query |

> [!TIP]
> Use specific field keys for context-specific search forms; for example, a search that only deals in emails should use the `email` key name to describe the input and `search` to describe the form category.

### Selector Arrays

Each field key maps to an array of one or more items. Each item is either:

- A **selector string** — a single CSS selector targeting one element
- A **selector sequence** (array of strings) — an ordered list of CSS selectors
  targeting multiple elements that together compose a single value for the field

The array as a whole represents alternatives for locating the concern. The
presence of multiple items does not imply how a consumer should make use of them
(e.g. use all or only the first found). The _order_ of items in the outer array
does not imply precedence.

> [!IMPORTANT]
> Cases where input selectors are mutually-exclusive should be represented
> within independent `forms` array entries.

A username with multiple alternative selectors:

```json
{
  "username": [
    "input#specific-email-field",
    "form.login input[type='email']",
    "input[autocomplete='username']"
  ]
}
```

#### Selector Sequences

Some forms split a single value across multiple input elements (e.g. a one-time
code entered one digit per field). A selector sequence represents this case as
an ordered array of selectors within the outer alternatives array.

```json
{
  "oneTimeCode": [
    [
      "input[name='otp-code-0']",
      "input[name='otp-code-1']",
      "input[name='otp-code-2']",
      "input[name='otp-code-3']",
      "input[name='otp-code-4']",
      "input[name='otp-code-5']"
    ]
  ]
}
```

Order is significant within a sequence. The map does not specify how the value
is split across the elements.

A field may include both individual selectors and sequences as alternatives:

```json
{
  "oneTimeCode": [
    "input#single-otp-field",
    [
      "input[name='otp-0']",
      "input[name='otp-1']",
      "input[name='otp-2']",
      "input[name='otp-3']",
      "input[name='otp-4']",
      "input[name='otp-5']"
    ]
  ]
}
```

> [!IMPORTANT]
> Selector sequences should be avoided if a field key already exists that
> captures split value concerns (e.g. use selectors for `phoneCountryCode`,
> `phoneAreaCode`, and `phoneLocal` over `phone` with a selector sequence) as
> it inherently has greater specificity.

### Boundary-Crossing Selectors (`>>>`)

The `>>>` combinator represents a boundary crossing from a host element into
nested content that standard CSS selectors cannot reach. The segments between
`>>>` are standard CSS selectors. Each `>>>` represents one boundary crossing
and must never be "naked" (a selector is required on both sides of the combinator).

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
> Remember, an `iframe` [cannot be a shadow host](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow#elements_you_can_attach_a_shadow_to).

## Actions

The optional `actions` object maps action keys to arrays of CSS selectors.
Each key identifies a form action or progression element; these describe
structural interactions (not data) that a consumer may need to trigger.

```json
{
  "fields": {
    "username": ["input#email"],
    "password": ["input#password"]
  },
  "actions": {
    "submit": ["button[type='submit']"],
    "next": ["button.continue"]
  }
}
```

| Key | Description |
| --- | --- |
| `submit` | Final form submission |
| `save` | Save or persist the form's current state (e.g. drafts) |
| `next` | Progression to the next step in a multi-step form |
| `previous` | Backward navigation in a multi-step form |
| `cancel` | Cancel or abandon the form |
| `reset` | Reset the form to its initial state |

Action values are arrays of CSS selector strings, following the same
boundary-crossing conventions as field selectors (see
[Boundary-Crossing Selectors](#boundary-crossing-selectors-)). Unlike field
selector arrays, action selector arrays should not be described with
[selector sequences](#selector-sequences).

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

5. **Do not map captchas or honeypots.** CAPTCHAs, honeypot fields, and other
   anti-automation mechanisms are not form data and must not be captured by Maps.

6. **Skip intentionally.** Use `null` on pages where mapping is deliberately
   absent (e.g. search pages, pages with no relevant forms).

7. **Avoid redundancy.** If all pages on a host use the same form, put it in
   host-level `forms` and omit `pathnames`. Only add pathname entries for pages
   that differ.

8. **Keep pathnames exact.** Pathname keys must exactly match the URL path.
   Wildcards and pattern matching are not supported.

9. **Treat hosts as exact matches.** `example.com`, `subdomain.example.com`,
   and `example.com:8443` are different host keys. Author entries under the
   non-`www` host as canonical; only add a separate `www.` entry if its forms
   differ from the non-`www` counterpart (see
   [The `www` subdomain](#the-www-subdomain)).

10. **Omit what you don't need.** If a host has no site-wide fallback, omit
    `forms`. If there are no page-specific entries, omit `pathnames`.

11. **Remove stale entries.** If a site updates to use standard mechanisms (e.g.
    `autocomplete` attributes) that make the Map entry unnecessary, remove it.
    Maps are a stopgap, not a permanent fixture.

12. **Document non-obvious selectors.** If a selector targets an element through
    an unusual DOM structure (deeply nested shadow roots, dynamically injected
    containers), add context in the change pull request explaining why that path
    is necessary.
