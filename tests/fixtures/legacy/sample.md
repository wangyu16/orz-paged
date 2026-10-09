{{nyml
kind: document
template: article
page_size: A4
header_center: orz-paged demo
footer_left: Yu Wang
page_number_position: footer-center
page_number_style: page-n-of-N
}}

{{nyml
kind: article-title
title: A Paged Document Demo
subtitle: Markdown to paged.js to PDF, in one editable file
author: Yu Wang
date: June 2026
}}

{{nyml
kind: abstract
text: This document demonstrates **orz-paged** — an editable `.paged.html` that paginates in the browser with paged.js and exports to PDF by printing. It reuses orz-markdown for content and a curated document model for page furniture.
keywords: paged.js, markdown, print, single-file
}}

## Introduction

orz-paged turns Markdown into print pages. This paragraph has **bold**, *italic*,
and `inline code`, plus a list:

- First point about pagination
- Second point about running headers and footers
- Third point about page numbers

Some inline math, $E = mc^2$, and a display equation:

$$\int_0^1 x^2 \, dx = \frac{1}{3}$$

### A Table

| Element | Purpose |
|---|---|
| article-title | the document title block |
| abstract | a short summary with keywords |
| toc | table of contents |

> A blockquote, to check print-friendly quote styling across the page flow.

## Filler Section One

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam
voluptatem quia voluptas sit aspernatur aut odit aut fugit.

::: page-break
:::

## After an Explicit Page Break

This heading is preceded by `::: page-break`, so it should begin a new page.

Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur,
adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et
dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum
exercitationem ullam corporis suscipit laboriosam.

1. An ordered item
2. Another ordered item
3. A third, to confirm list numbering in the paged flow

That is the end of the demo.
