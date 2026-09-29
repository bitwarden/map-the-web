# Forms Map

The Forms Map (`forms.jsonc`) describes the locations of form fields on web pages
using CSS selectors. It enables consuming applications to locate specific fields
without relying on heuristic determinations or page-specific detection logic.

This Map describes the page. It does not prescribe or imply how
a consumer of this Map should behave (though it may offer examples or
suggestions). Additionally, the term "form" here describes the user-facing
concept of one or more related input fields that a user supplies values to,
which may or may not utilize the HTML `form` tag. See the project
[README](../../README.md) for broader mapping philosophies.

- [Forms Map](#forms-map)
  - [Limitations](#limitations)
  - [Schema Version Bumps](#schema-version-bumps)
  - [Data Structure Overview](#data-structure-overview)
  - [Host Keys](#host-keys)
    - [Internationalized Domain Names](#internationalized-domain-names)
    - [The `www` subdomain](#the-www-subdomain)
    - [Ports](#ports)
  - [Pathnames](#pathnames)
    - [Trailing Slashes](#trailing-slashes)
  - [Fragments](#fragments)
    - [When a Fragment Entry Applies](#when-a-fragment-entry-applies)
    - [Fragment Keys](#fragment-keys)
    - [Host-Level Fragments](#host-level-fragments)
  - [Forms](#forms)
    - [Multiple Forms](#multiple-forms)
    - [Category](#category)
  - [Entry Hierarchy](#entry-hierarchy)
  - [Selector Philosophy](#selector-philosophy)
    - [User-Facing Values](#user-facing-values)
  - [Container](#container)
  - [Fields](#fields)
    - [Field Keys](#field-keys)
      - [Authentication](#authentication)
      - [Names](#names)
      - [Phone Numbers](#phone-numbers)
      - [Addresses](#addresses)
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
- form rendering timings
- distinguishing URLs by a query string that affects rendered form content
- fields which lack any static targetable qualities (e.g. sites that randomize tag name/attribute values on each render)
- indicators of irrelevant data at the form field level
- representing site structures that repeat across host domains (e.g. regional subdomains, brand platforms)

## Schema Version Bumps

See the project [README](../../README.md#schema-versions) for general versioning
guidance. The following table describes what constitutes each type of version
bump for the Forms Map schema:

| Change | Bump |
| --- | --- |
| Schema description or documentation changes | Patch |
| Tightening a validation pattern that does not reject previously-valid data | Patch |
| Adding a new field key, action key, or category | Minor |
| Adding a new optional property to a host, pathname, fragment, or form entry | Minor |
| Removing or renaming a key, category, or required property | Major |
| Making a previously optional property required | Major |
| Changing the meaning of an existing key | Major |
| Changing the structure of an existing property | Major |

> [!NOTE]
> Adding new enum values (field keys, action keys, categories) is a minor bump
> because consumers should gracefully handle unrecognized values. However,
> consumers that validate Map data against a schema must use the schema included
> in the same release (see [Releases](../../README.md#releases)); a stale schema
> copy will reject data containing newly added values.

## Data Structure Overview

```jsonc
{
  "schemaVersion": "1.1.0",
  "hosts": {
    "<host>": {
      "forms": [ ... ],           // optional; site-wide fallback
      "fragments": {              // optional; site-wide fragment states
        "<fragment>": {
          "forms": [ ... ]
        },
        "<fragment>": null        // signals this fragment state has no relevant forms
      },
      "pathnames": {              // optional
        "<pathname>": {
          "forms": [ ... ],       // optional; pathname-wide fallback
          "fragments": {          // optional
            "<fragment>": {
              "forms": [ ... ]
            },
            "<fragment>": null    // signals this fragment state has no relevant forms
          }
        },
        "<pathname>": null        // signals this page has no relevant forms
      }
    },
    "<host>": null                // signals all pages on this host have no relevant forms
  }
}
```

A complex entry may look like:

```json
{
  "schemaVersion": "1.1.0",
  "hosts": {
    "example.com": {
      "forms": [
        {
          "category": "account-login",
          "container": ["form#login-form"],
          "fields": {
            "username": ["form#login-form input#email"],
            "password": ["form#login-form input#pass"]
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
                "newPassword": ["input#reg-password"]
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

The Forms Map is scoped to pages served over HTTP and HTTPS. Other URI schemes
(e.g. `ftp`, `file`, `chrome`) are out of scope. Because the protocol is not
included in host keys, entries implicitly cover both `http` and `https` for a
given host (see also: [Ports](#ports)).

Each key in the `hosts` object is a **host**: a hostname, or a hostname with a
port when a non-default port is used. Do not include the protocol, path, query
string, or fragment.

```jsonc
{
  "hosts": {
    "example.com": { ... },
    "login.subdomain.example.com": { ... },
    "example.com:1234": { ... }
  }
}
```

Host keys must be **exact hosts**. Entries must not assume equivalence between
a host and its subdomains, or between a host and its non-default port
counterparts:

- `example.com` and `sub.example.com` require separate entries
  (with the potential exception of [www](#the-www-subdomain))
- `example.com` and `example.com:8443` require separate entries

Populated host key values **must** be objects with `forms`, `fragments`, and/or
`pathnames` keys with valid values. Use a `null` value to authoritatively indicate when
there are no relevant forms across the host's pages. See also:
[Null and Empty Semantics](#null-and-empty-semantics)

### Internationalized Domain Names

Internationalized domain names (IDNs) should be authored using their Unicode form,
not Punycode.

Unicode host keys are normalized to Punycode (ASCII) at build time, ensuring
that consumers of the built Maps will receive ASCII keys:

<!-- cspell:disable-next-line -->
- `münchen.de` → built as `xn--mnchen-3ya.de`
- `例え.jp` → built as `xn--r8jz45g.jp`

### The `www` subdomain

Many sites serve identical content on both `example.com` and `www.example.com`.
To avoid redundant entries, author host keys under the non-`www` entry as
canonical. Do not add a separate `www.` entry unless the site differs at the
`www` subdomain. When no explicit `www.` entry exists, consumers should treat a
`www.` URL as equivalent to its non-`www.` counterpart for lookup.

### Ports

Non-default ports are always included in the key. Default ports (`:443` for
HTTPS, `:80` for HTTP) should be omitted unless the site serves different
content over HTTP and HTTPS. In that rare case, include the default port
explicitly to distinguish the entries (e.g. `example.com:443` for HTTPS-only
content, `example.com:80` for HTTP-only content). When no explicit default-port
entry exists, consumers should assume the entry applies to both protocols.

Standard URL parsers (`URL.host`) strip default ports, so consumers that
encounter an explicit default-port key will need to handle the lookup
accordingly.

| URL                        | Key                                                      |
| -------------------------- | -------------------------------------------------------- |
| `https://example.com`      | `example.com`                                            |
| `https://example.com:443`  | `example.com` (default port, omit unless HTTP differs)   |
| `https://example.com:8443` | `example.com:8443`                                       |
| `http://example.com:3000`  | `example.com:3000`                                       |
| `http://example.com:80`    | `example.com` (default port, omit unless HTTPS differs)  |

## Pathnames

The `pathnames` object maps URL pathnames to page-specific entries. Pathnames
must start with `/`.

```json
{
  "schemaVersion": "1.1.0",
  "hosts": {
    "example.com": {
      "forms": [
        {
          "category": "account-login",
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
              "category": "account-login",
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
authoritatively indicate that the page presents no forms in scope of this Map.
See also: [Null and Empty Semantics](#null-and-empty-semantics)

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

## Fragments

The optional `fragments` object maps
[URI fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)
to fragment-specific entries (e.g. `/auth#register`). It describes pages whose
form content is determined by the fragment, a pattern commonly used by
hash-based client-side routing.

It appears within a `pathnames` entry, where it describes fragment states of
that one page, or alongside the host-level `forms`, where it describes
fragment states that render the same form content on any page of the host (see
[Host-Level Fragments](#host-level-fragments)).

```jsonc
{
  "schemaVersion": "1.1.0",
  "hosts": {
    "example.com": {
      "pathnames": {
        "/": {
          "fragments": {
            // This example describes a login form that only appears on the
            // homepage when the `#login` fragment is active
            "#login": {
              "forms": [
                {
                  "category": "account-login",
                  "fields": {
                    "email": ["input#login-email"],
                    "password": ["input#login-password"]
                  }
                }
              ]
            },
            "#/register": {
              "forms": [
                {
                  "category": "account-creation",
                  "fields": {
                    "email": ["input#register-email"],
                    "newPassword": ["input#register-password"]
                  }
                }
              ]
            },
            "#/help": null
          }
        }
      }
    }
  }
}
```

A `pathnames` entry may carry _both_ `forms` and `fragments`. The `forms` value then
describes the page in any fragment state that **no** `fragments` key matches (e.g. `/auth#login` and `/auth` are distinct cases covered under the `pathnames` entry).

```jsonc
{
  "pathnames": {
    "/account": {
      "forms": [
        {
          "category": "account-login",
          "fields": {
            "email": ["input#email"],
            "password": ["input#password"]
          }
        }
      ],
      "fragments": {
        "#recover": {
          "forms": [
            {
              "category": "account-recovery",
              "fields": {
                "email": ["input#recovery-email"]
              }
            }
          ]
        }
      }
    }
  }
}
```

### When a Fragment Entry Applies

Fragment entries should be used sparingly. Only use a fragment entry when the targeted form is **absent from the document**
until the fragment is active (e.g. a hash router that mounts a route's
components, or a `hashchange` handler that renders the form on demand).

Do not add a fragment entry when the fragment only scrolls to, or reveals, a
form that is already in the document.

> [!NOTE]
> Unlike the pathname, a fragment changes without a navigation event. Consumers should be prepared to handle such fragment changes.

### Fragment Keys

Fragment keys must start with `#` and must not contain whitespace. The `#` is
included so the key maps directly onto the fragment as a URL parser reports it.

**Author keys exactly as `URL.hash` reports the fragment**, and match them by
exact string comparison. A URL parser percent-encodes whitespace, non-ASCII
characters, `"`, `<`, `>`, and `` ` `` when it serializes a fragment, so those
appear in a key in their encoded form:

| Fragment as presented | Fragment key |
| --- | --- |
| `#/search/a b` | `#/search/a%20b` |
| `#café` | `#caf%C3%A9` |
| `#/login` | `#/login` |

Do not percent-decode either side before comparing. Decoding would conflate
fragments that a URL parser keeps distinct (`#a%2Fb` and `#a/b` are different
states), and `decodeURIComponent` raises a `URIError` on fragments that parse
perfectly well, such as `#%zz`.

Matching is case-sensitive, applies to percent-encoding as well (`%2f` and
`%2F` are distinct), and applies no trailing-slash normalization; `#/login`,
`#/Login`, and `#/login/` are three different keys. Author the entry with the
form the site actually produces.

A further `#` symbol is permitted after the first one. Everything following the first
`#` is part of the fragment, and a URL parser does not encode subsequent ones, so
`#/login#step2` is a reachable state and a valid key.

> [!NOTE]
> Entries do not represent or imply representation of a fragment within a full URI.
> For example, a fragment may be preceded by a query string in a URI:
> `https://www.example.com/account?utm_content="textlink"&utm_medium="search"#/login`
> Consequently, consumers are advised to handle matching against fragments as an
> independent concern rather than via string assembly and comparison.

### Host-Level Fragments

Every HTTP(S) URL carries a pathname of at least `/`, so a fragment is
always reachable under a `pathnames` key; `https://example.com#login` is keyed
as `pathnames["/"].fragments["#login"]`.

A host-level `fragments` therefore does not exist to describe a fragment with
no path. It describes a fragment state that renders the same form content on
**any** page of the host, such as a header link (`<a href="#login">`) that
opens the same login modal site-wide:

```json
{
  "hosts": {
    "example.com": {
      "fragments": {
        "#login": {
          "forms": [
            {
              "category": "account-login",
              "container": ["div#login-modal"],
              "fields": {
                "email": ["input#modal-email"],
                "password": ["input#modal-password"]
              }
            }
          ]
        }
      }
    }
  }
}
```

Like any host-level entry, this describes every page of the host. Where the
fragment renders different content on different pages, or exists on only some
of them, describe it under the relevant `pathnames` entries instead.

A site-wide fragment entry reaches every page with no `pathnames` entry, and any
page whose entry is not `null` and has neither the same fragment key nor a
`forms` property.

```jsonc
{
  "hosts": {
    "example.com": {
      "fragments": {
        "#login": { "forms": [ ... ] }          // the site-wide modal
      },
      "pathnames": {
        "/welcome": {
          "fragments": {
            "#login": { "forms": [ ... ] }      // a different modal, here only
          }
        },
        "/status": {
          "fragments": {
            "#login": null                      // no modal on this page
          }
        },
        "/account": {
          "forms": [ ... ]                      // page describes itself
        }
      }
    }
  }
}
```

Here `/welcome#login` describes its own modal, `/status#login` describes none,
and `/account#login` resolves to the account page's own `forms` rather than the
modal. Every other page of the host continues to resolve `#login` to the
site-wide entry.

Because a page's own `forms` precludes the site-wide `fragments`, a page
that has both its own forms and the site-wide fragment state must restate the
fragment under its own `fragments`. See
[Entry Hierarchy](#entry-hierarchy) for the full order.

## Forms

Each entry in a `forms` array describes one logical form on a page. "Form" here
refers to the user-facing concept of a form (a group of related input fields)
and does not require a literal HTML `<form>` element.

```json
{
  "forms": [
    {
      "category": "account-login",
      "container": ["form#login-form"],
      "fields": {
        "username": ["form#login-form input#email"],
        "password": ["form#login-form input#password"]
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

- **Mixed form types**: e.g. a login form and a registration form on the same
  page
- **Multivariate layouts**: A/B tests or feature flags that change which form
  appears
- **Multi-step flows**: Single-page applications where different forms render
  at the same URL

```json
{
  "forms": [
    {
      "category": "account-login",
      "fields": {
        "username": ["input#login-email"],
        "password": ["input#login-pass"]
      }
    },
    {
      "category": "account-creation",
      "fields": {
        "username": ["input#register-email"],
        "newPassword": ["input#register-pass"]
      }
    }
  ]
}
```

### Category

The required `category` field describes the form's purpose. Consumers may use
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

## Entry Hierarchy

A URL resolves to no more than one entry, with precedence given to the most
specific match. Page-level entries are considered ahead of site-wide ones, and
within each level a fragment is considered ahead of `forms`. Specificity is
ranked as follows:

1. **Page fragment**: If the URL has a fragment, its pathname matches
   a key in `pathnames`, and that entry's `fragments` contains the fragment,
   that fragment entry should be considered the most relevant description of
   the URL.
2. **Page forms**: Otherwise, if the URL's pathname matches a key in
   `pathnames` that has `forms`, those forms should be considered the most
   relevant description of the URL.
3. **Site-wide fragment**: Otherwise, if the URL has a fragment, the URL's
   pathname did not match a `null` key in `pathnames`, and the host-level
   `fragments` contains the fragment, that fragment entry should be considered
   the most relevant description of the URL.
4. **Site-wide forms**: Otherwise, if no key in `pathnames` matched, the
   host-level `forms` should be considered the most relevant description of the
   URL.

**A URI is only represented by the most specific matching entry.** Once a
`pathnames` entry supplies a matching fragment or any `forms`, resolution stops
at the page level; the host-level `fragments` and `forms` do not contribute
toward describing that page. A `null` pathname entry stops resolution the same
way: the page presents no forms in scope of this Map in any of its fragment
states, so no host-level entry describes it. Where a page also presents a
site-wide form or fragment state, restate it under that page's own entry.

Given this Map entry, consider how various URIs at the host are described:

```jsonc
{
  "hosts": {
    "example.com": {
      "fragments": {
        "#login": { "forms": [ ... ] }        // form A
      },
      "pathnames": {
        "/": {
          "fragments": {
            "#register": { "forms": [ ... ] }, // form B
            "#login": { "forms": [ ... ] }     // form C
          }
        },
        "/account": {
          "forms": [ ... ]                     // form D
        },
        "/legal": null
      }
    }
  }
}
```

| URL | Described by | Why |
| --- | --- | --- |
| `example.com#login` | `C` | The root pathname entry replaces the site-wide one |
| `example.com#register` | `B` | Only the root pathname describes this fragment |
| `example.com/account#login` | `D` | `/account` describes its own forms, so the host-level entry does not apply |
| `example.com/account` | `D` | The page's own `forms` |
| `example.com/help#login` | `A` | No `/help` entry, so the site-wide claim of the host-level entry applies |
| `example.com/help` | nothing | No `/help` entry and no host-level `forms` |
| `example.com` | nothing | `/` matched but has no `forms`, and no fragment is present |
| `example.com#help` | nothing | `/` matched, does not describe `#help`, and there is no site-wide `#help` |
| `example.com/legal#login` | nothing | `/legal` is irrelevant, including its fragment states, so the site-wide claim does not apply |

## Selector Philosophy

Forms Map selectors are not stylesheet selectors. A stylesheet selector aims
for _resilience_; it should keep matching the same conceptual element as the
page evolves, so the styling survives. A Map selector aims for the opposite:
it is a curated record of what a known target (that is, the full node
hierarchy described by the selector, not just the leaf) looks like today. Tag
drift, attribute renaming, or structural change of the target is the kind of
signal that should trigger a review rather than be silently absorbed.

This inverts the conventional "make selectors resilient" advice: Forms Map
selectors should be brittle by design. If a page's login `<div role="form">`
becomes an actual `<form>`, or an `<input>` is replaced by a custom element,
the selector _should_ break; both as a prompt to a Map Author to re-verify
that the new target is still the right one and as a guard against a consuming
application interacting with something the Map was never authored to describe.

In practice, this means every selector segment should include a tag anchor.
Add the tag (e.g. `input[name='username']`, `button.submit#go`,
`input#user[type='email']`) so the selector breaks if the element type ever
changes. The same rule applies independently to each segment of a
boundary-crossing selector, so `iframe#login-frame >>> input[name='username']`
satisfies it on both sides; `#login-frame >>> input[name='username']` does
not.

### User-Facing Values

Brittleness is desirable when it tracks the page's _structure_; it is not
desirable when it tracks the page's _content_. Attribute values that are shown
to the user change independently of the structure that surrounds them: copy is
reworded, a string is A/B tested, the page is served in another locale, and in
the case of `value` on a text input the attribute reflects whatever the visitor
has typed. A selector that breaks for any of those reasons has not identified a
changed target; it has failed to describe an unchanged one.

Selectors should therefore use user-facing values **sparingly**. Prefer an
anchor that describes the target's shape rather than its copy:

| Prefer | Over |
| --- | --- |
| `input#email[name='email']` | `input[placeholder='Email address']` |
| `input[autocomplete='current-password']` | `input[aria-label='Password']` |
| `button[type='submit'][data-testid='login']` | `input[type='submit'][value='Log in']` |

The selector linter warns on matchers against `placeholder`, `title`, `alt`,
`value`, `aria-label`, `aria-placeholder`, and `aria-description`. Existence
checks are not flagged: `input[placeholder]` asserts that the attribute is
present, not what it says, so it describes structure rather than content.

The warning is advisory, not an error. Some targets genuinely offer nothing
else to distinguish them (e.g. two structurally identical inputs in the same
container). Where a user-facing value is the only viable anchor, keep it and
note in a comment why no alternative exists, so the entry can be
revisited if the site adds one.

## Container

The optional `container` property is a selector array identifying the form's
container element on the page. This is used to scope the form's fields and
actions within the page, and is often represented by a literal HTML `<form>`
tag or closest relevant/enclosing container if no relevant `<form>` is present.

```json
{
  "container": ["form#login-form"],
  "fields": {
    "username": ["form#login-form input#email"],
    "password": ["form#login-form input#password"]
  }
}
```

## Fields

The `fields` object maps keys to arrays of CSS selectors. Each key identifies
the **user data concept** that a form field captures. A consumer should be
able to determine what value belongs in the field from the key name and form
[category](#category) alone. Selector specificity should not rely on other
selectors (e.g. a `container` selector).

```json
{
  "fields": {
    "username": ["input#email", "input[name='login']"],
    "password": ["input#password"]
  }
}
```

### Field Keys

Field keys are constrained to the following set:

| Key | Description |
| --- | --- |
| `username` | User identifier or handle |
| `password` | Current password |
| `newPassword` | New or confirmation password |
| `oneTimeCode` | Single-use verification code (SMS, email, authenticator, etc.) |
| `fullName` | Full name (single combined field) |
| `honorificPrefix` | Title or honorific prefix (Mr., Dr., etc.) |
| `firstName` | Given name |
| `middleName` | Middle or additional name |
| `lastName` | Family name |
| `honorificSuffix` | Suffix (Jr., PhD, etc.) |
| `email` | Email address |
| `phone` | Full telephone number (single combined field) |
| `phoneCountryCode` | Country code (e.g. "1", "44") |
| `phoneAreaCode` | Area code |
| `phoneLocal` | Local number (without country or area code) |
| `phoneExtension` | Extension number |
| `organization` | Company, organization, or institution name |
| `streetAddress` | Full street address (multi-line block) |
| `addressLine1` | First line of street address |
| `addressLine2` | Second line of street address |
| `addressLine3` | Third line of street address |
| `addressLevel1` | Broadest administrative division (e.g. state, province, prefecture, canton, county, region) |
| `addressLevel2` | Locality (e.g. city, town, village, municipality) |
| `addressLevel3` | Sub-locality (e.g. district, suburb, ward, borough) |
| `addressLevel4` | Finest-grained subdivision (e.g. block, neighborhood section) |
| `postalCode` | ZIP or postal code |
| `country` | Country or territory |
| `birthdate` | Full birth date (single combined field) |
| `birthdateDay` | Day component |
| `birthdateMonth` | Month component |
| `birthdateYear` | Year component |
| `cardholderName` | Name as printed on card |
| `cardNumber` | Card number |
| `cardExpirationDate` | Combined expiration (single field; e.g. MM/YY) |
| `cardExpirationMonth` | Expiration month |
| `cardExpirationYear` | Expiration year |
| `cardCvv` | Security code (CVV / CVC / CSC) |
| `cardType` | Card network or brand (Visa, Mastercard, etc.) |
| `consentTerms` | Terms of service or terms and conditions acceptance |
| `consentPrivacy` | Privacy policy acceptance |
| `consentRememberUser` | Authentication memory preference (e.g. "remember me") |
| `consentUser` | General user confirmation (e.g. "I agree", "I confirm") |
| `searchTerm` | Free-text search query |

The role of a given field is not implied by the field key name or definition.
Rather, [form category](#category) informs the context of the field's role.

For example, `email` and `phone` can be represented in a shipping form
(`address`), account registration form (`account-creation`), or authentication
form (`account-login`); the field keys in each situation describe the fields
in the same way, and disambiguation of purpose is distinguished by the form
`category`.

However, some fields are inherently incompatible with some form categories
(e.g. the presence of a `password` field precludes the form belonging to the
`account-creation` category). Those cases are represented in the Forms Map schema.

The kind of field input is also not implied by the field key name or
definition. For example, a `password` selector may describe an `input`
element with a `text` or `password` value of the `type` attribute.

#### Authentication

In cases where an email is used for authentication, the `email` field key
should be used, not `username`. Other values used in authentication should
use the most specific appropriate key name (e.g. phone numbers used to log
in should still be represented as `phone`).

Note, a field described by the `username` key is not exclusive to
authentication concerns, and may be represented in other form categories.

#### Names

Where a form collects name data as a single field, use `fullName`. Where it
collects name components separately, use the appropriate individual keys.

#### Phone Numbers

Where a form collects a phone number as a single field, use `phone`. Where it
collects phone components separately, use the individual keys.

#### Addresses

Street address data may appear as a single multi-line field (e.g. a `<textarea>`)
or as separate address lines. Use `streetAddress` for the combined form and
`addressLine*` for individual lines.

Administrative divisions use an abstract leveling system to accommodate
international variation. Each level represents a progressively finer geographic
subdivision.

> [!NOTE]
> Not all countries use all four address levels. Most forms will only need
> `addressLevel1` (state/province) and `addressLevel2` (city). Use only the
> levels that correspond to actual fields on the form.

#### Birthdate

Where a form collects a birthdate as a single field, use `birthdate`. Where it
collects date components separately, use the individual keys.

#### Payment Card

A combined expiration field (`cardExpirationDate`) is not the same as separate
month and year fields (`cardExpirationMonth` / `cardExpirationYear`). Use the
key that matches the actual input structure on the page.

#### Consent

Note, consent field keys `consentTerms`, `consentPrivacy`,
`consentRememberUser`, and `consentUser` do not indicate how the user needs to
interact with the input/field in order to convey their consent. They can
equally describe a text field (e.g. "Type 'I agree'"), opt-in (e.g. "check to
agree to the terms"), or opt-out (e.g. "check to NOT agree").

#### Search

Use specific field keys for context-specific search forms; for example, a
search that only deals in emails should use the `email` key name to describe
the input and `search` to describe the form category.

### Selector Arrays

Each field key maps to an array of one or more items. Each item is either:

- A **selector string**: a single CSS selector targeting one element
- A **selector sequence** (array of strings): an ordered list of CSS selectors
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

Order is significant within a sequence. The Map does not specify how the value
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
  "username": ["div#host-element >>> form > input[name='username']"]
}
```

For nested shadow roots:

```json
{
  "username": ["div#outer-host >>> div#inner-host >>> input[name='user']"]
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

Action selectors follow the same boundary-crossing conventions as field
selectors (see
[Boundary-Crossing Selectors](#boundary-crossing-selectors-)). Unlike field
selector arrays, action selector arrays do not support
[selector sequences](#selector-sequences).

## Null and Empty Semantics

The presence or absence of entries carries meaning. This table summarizes the
interpretation at each level:

| Location             | Value   | Meaning                                                                |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| Host key             | `null`  | No page on this host presents forms in scope of this Map               |
| Host key             | omitted | No forms information about this host                                   |
| `forms` (host-level) | omitted | No forms information that applies site-wide                            |
| `fragments` (host-level) | omitted | No forms information about fragment states that apply site-wide |
| `pathnames`          | omitted | No page-specific forms information                                     |
| Pathname key         | `null`  | This specific page presents no in-scope forms (includes page fragment states) |
| Pathname key         | omitted | No information about this page; the host-level entry applies           |
| `forms` (pathname-level) | omitted | No forms information about this page outside the fragment states it describes; the host-level `forms` does not apply, though a host-level `fragments` entry may |
| `fragments` (pathname-level) | omitted | No fragment-specific forms information about this page      |
| Fragment key (host-level) | `null` | This fragment state presents no in-scope forms anywhere on the host |
| Fragment key (pathname-level) | `null` | This fragment state presents no in-scope forms on this page, regardless of host-level `fragments` entries of the same fragment |
| Fragment key (host-level) | omitted | No information about this fragment state site-wide; the host-level `forms` applies when no `pathnames` key matched |
| Fragment key (pathname-level) | omitted | No information about this fragment state on this page; the page's `forms` applies, else the host-level `fragments` entry for the key |

The distinction between a `null` value and an omission is important. A `null`
indicates that the page presents no forms in scope of this Map. The key's
presence is what indicates the page was evaluated and deliberately excluded (a
consumer may use this signal to skip form detection heuristics, for example). An
omission states nothing about the page: it has not been mapped, or mapping is
unnecessary.

## Authoring Guidelines

1. **Test your selectors.** Open the target page in a browser, open DevTools,
   and verify each selector with `document.querySelector()`.

2. **Target the rendered state.** Selectors should match elements in their final
   rendered form, not necessarily the initial HTML. Many sites load form fields
   dynamically via JavaScript; test selectors after the page has fully loaded.
   Consumers are responsible for their own timing strategy (e.g. polling,
   MutationObserver) when elements are not immediately present.

3. **Be specific.** Prefer tag selectors with an accompanying ID or attribute
   over positional pseudos (e.g. `:nth-child`) or bare tag (e.g. `div`). Classes
   should be non-preferred in selector descriptions as they typically represent
   broad concerns.

4. **Use `>>>` only when necessary.** Only use boundary-crossing selectors when
   the target element is actually inside a shadow root or iframe.

5. **Do not map captchas or honeypots.** CAPTCHAs, honeypot fields, and other
   anti-automation mechanisms are not form data and must not be captured by Maps.

6. **Skip intentionally.** Use `null` on pages where mapping is deliberately
   absent (e.g. search pages, pages with no relevant forms).

7. **Avoid redundancy.** If all pages on a host use the same form, put it in
   host-level `forms` and omit `pathnames`. Only add pathname entries for pages
   that differ. A fragment state that renders the same form on every page
   belongs in the host-level `fragments` for the same reason. Note that a page
   supplying its own `forms` masks the site-wide `fragments`, so such a page
   must restate any fragment state it also has; see
   [Host-Level Fragments](#host-level-fragments).

8. **Keep pathnames exact.** Pathname keys must exactly match the URL path.
   Wildcards and pattern matching are not supported. This also applies to
   [fragment keys](#fragment-keys).

9. **Only use fragments when they change the page's relevant content.** Add a
   `fragments` entry when the form is absent from the document until the
   fragment is active (e.g. hash routing). A fragment that only scrolls to or
   reveals an already-present form belongs under the pathname's `forms`; see
   [When a Fragment Entry Applies](#when-a-fragment-entry-applies).

10. **Treat hosts as exact matches.** `example.com`, `subdomain.example.com`,
    and `example.com:8443` are different host keys. Author entries under the
    non-`www` host as canonical; only add a separate `www.` entry if its forms
    differ from the non-`www` counterpart (see
    [The `www` subdomain](#the-www-subdomain)).

11. **Omit what you don't need.** If a host has no site-wide fallback, omit
    `forms`. If there are no page-specific entries, omit `pathnames`. If a host
    or page has no fragment-specific entries, omit `fragments`.

12. **Remove stale entries.** If a site updates to use standard mechanisms (e.g.
    `autocomplete` attributes) that make the Map entry unnecessary, remove it.
    Maps are a stopgap, not a permanent fixture.

13. **Document non-obvious selectors.** If a selector targets an element through
    an unusual DOM structure (deeply nested shadow roots, dynamically injected
    containers), add context in the change pull request explaining why that path
    is necessary.

14. **Avoid matching user-facing values.** Values the user reads (e.g.
    `placeholder`, `aria-label`, `title`) describe the page's content, not its
    structure, and change without the target changing. Prefer a non-user-facing
    anchor where possible; see [User-Facing Values](#user-facing-values).
