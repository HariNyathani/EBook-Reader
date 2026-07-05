# QA Checklist

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

This checklist is completed by the QA lead before each release
candidate. It is the human counterpart to the automated a11y +
E2E + performance gates in CI.

For the release process, see [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md).
For the automated a11y tests, see `tests/e2e/a11y/`.

---

## 1. Keyboard operability

Run through EVERY flow using ONLY the keyboard (Tab / Shift+Tab /
Enter / Space / Arrow keys / Esc). For each item, verify:

### 1.1 Auth

- [ ] Tab order is logical: email → password → sign-in button → register link.
- [ ] Sign-in with Enter submits the form.
- [ ] Validation errors are announced (aria-describedby or live region).
- [ ] Pressing Esc on a modal dialog closes it (if any).

### 1.2 Library / dashboard

- [ ] Tab through the catalog grid: every book card is reachable.
- [ ] Each book card's "Open" / "Add to library" / "Download" buttons
      are reachable in order.
- [ ] The "Continue reading" section is keyboard-navigable.
- [ ] The toolbar (Search, Filters) is keyboard-operable.

### 1.3 Reader

- [ ] Reader chrome (toolbar + progress bar) is keyboard-reachable.
- [ ] TOC drawer, Search panel, Typography panel, Theme switcher
      all open on activation and trap focus while open.
- [ ] Esc closes the open panel.
- [ ] Arrow Left / Arrow Right page-turn.
- [ ] Tab into the chapter list moves through chapters; Enter
      navigates and closes the drawer.
- [ ] Skip-to-content link moves focus to the main content (if
      present).

### 1.4 Admin

- [ ] The admin nav is keyboard-operable.
- [ ] User table rows are focusable; the action menu (approve /
      revoke / toggle admin) is keyboard-reachable.
- [ ] The upload form is keyboard-operable; the file input is
      accessible (it is, by HTML standards, but verify).
- [ ] Confirm dialogs (if any) trap focus and respond to Esc / Enter.

### 1.5 Settings

- [ ] All form controls (radio, select, slider) are keyboard-operable.
- [ ] The "Reset to defaults" button is reachable and announces a
      confirmation.

### 1.6 Sign-out

- [ ] The sign-out button is keyboard-reachable and activates on
      Enter / Space.

---

## 2. Screen reader (NVDA / VoiceOver)

Use NVDA on Windows or VoiceOver on macOS. For each item:

- [ ] All pages announce their title (`<h1>` or `aria-label`).
- [ ] All landmarks (`header`, `main`, `nav`, `footer`) are
      announced.
- [ ] All form fields have accessible labels.
- [ ] All buttons have accessible names (no "button" with no name).
- [ ] All images have alt text (decorative images have `alt=""`).
- [ ] The reader announces chapter changes ("Chapter: ...") and
      page changes ("Page changed.").
- [ ] The reader announces loading and error states.
- [ ] The offline indicator is announced when the network drops.
- [ ] The PWA install prompt is announced politely.
- [ ] The "update available" toast is announced politely and
      dismissible.

---

## 3. Reduced motion

Set the OS / browser to "Reduce motion" and verify:

- [ ] The reader chrome (toolbar + progress bar) appears and
      disappears instantly (no slide animation).
- [ ] The TOC / Search / Typography drawers open and close
      instantly.
- [ ] The PWA install / update toasts do not slide in.
- [ ] The progress bar fill does not animate (it changes abruptly).
- [ ] The book page-turn (foliate) does not animate.
- [ ] No background motion (e.g. loading spinners) is animated.

---

## 4. Color contrast

Run the AA contrast checker on every theme + every page:

### 4.1 Light theme

- [ ] Body text: contrast ≥ 4.5:1 against the background.
- [ ] Large headings: ≥ 3:1.
- [ ] Disabled / muted text: ≥ 3:1 (relaxed; we aim higher).
- [ ] Button text on button background: ≥ 4.5:1.
- [ ] Focus rings: ≥ 3:1 against the background.

### 4.2 Sepia theme

- [ ] Same checks as light, on the sepia background.

### 4.3 Dark theme

- [ ] Body text: ≥ 4.5:1.
- [ ] Large headings: ≥ 3:1.
- [ ] Button text: ≥ 4.5:1.
- [ ] Focus rings visible against the dark background.

### 4.4 Reader content (foliate)

- [ ] The reader's own typography respects the user's font size.
- [ ] The reader's link / highlight colors meet AA against the
      background (this is set by the engine CSS variables).

---

## 5. Touch targets

Verify every interactive element on a mobile viewport is at
least 44×44 CSS pixels (Apple HIG) / 48×48 (WCAG 2.5.5):

- [ ] All header buttons (back, TOC, search, typography, theme).
- [ ] All book card action buttons.
- [ ] All form controls.
- [ ] All panel close buttons.
- [ ] The sign-out button.

If any control is smaller, pad the clickable area (visible
border / extra padding) without enlarging the visual design.

---

## 6. Forms

- [ ] Every form field has a visible label.
- [ ] Every form field has an associated error message
      (`aria-describedby`).
- [ ] Required fields are marked with both visual AND
      `aria-required="true"`.
- [ ] The submit button is disabled only when the form is
      invalid AND the user has attempted to submit (avoid
      premature disablement).
- [ ] Validation messages are announced to the screen reader.

---

## 7. Live regions

- [ ] The reader announces chapter changes.
- [ ] The reader announces page changes (throttled).
- [ ] The progress save indicator (saving / saved / offline) is
      announced politely.
- [ ] The offline indicator (online / offline) is announced.
- [ ] The PWA install prompt is announced politely.
- [ ] The PWA update-available toast is announced politely.

---

## 8. Sign-off

- [ ] Keyboard: signed off by ____________ on ____________
- [ ] Screen reader: signed off by ____________ on ____________
- [ ] Reduced motion: signed off by ____________ on ____________
- [ ] Color contrast: signed off by ____________ on ____________
- [ ] Touch targets: signed off by ____________ on ____________
- [ ] Forms: signed off by ____________ on ____________
- [ ] Live regions: signed off by ____________ on ____________

When all are signed off, attach this document to the release
ticket.
