# Project Instructions

## Project type

This is a small mobile-first SPA built with vanilla JavaScript, HTML and CSS.

There is no framework, bundler or backend.

## Architecture

Current architecture includes:

* `index.html` — main HTML page and application shell
* `css/styles.css` — application styles
* `js/app.js` — hash-based routing and screen rendering
* `js/data.js` — loading and filtering JSON data
* `js/storage.js` — localStorage wrapper and user state
* `data/` — JSON content/data files

Use the existing architecture whenever possible.

## General development rules

* Work with the existing codebase.
* Do not rewrite existing architecture without a concrete reason.
* Prefer small, targeted changes.
* Before changing code, inspect the relevant existing files and understand how they currently work.
* Reuse existing routing, data loading, storage and UI patterns.
* Do not introduce unnecessary abstractions.

## Technology restrictions

Do not add:

* frameworks;
* new libraries;
* CDN dependencies;
* backend services;
* external APIs;
* analytics;
* external images;
* external fonts.

Use only the technologies already present in the project unless explicitly instructed otherwise.

## UX requirements

The application is mobile-first.

Maintain:

* minimum 44×44 px touch targets for interactive elements;
* body text of at least 16 px unless there is a strong existing design reason otherwise;
* no horizontal overflow;
* consistent visual language with the existing application;
* clear navigation and back behavior.

## Data

Content should remain separated from application logic where the existing architecture supports this.

JSON data files should follow the schemas defined in the relevant project specifications.

Do not invent factual content when a specification or source file already defines it.

## Existing functionality

Do not break existing functionality while implementing new features.

In particular, preserve:

* the existing "Подготовка" screen;
* existing routing;
* existing localStorage behavior;
* existing navigation.

Changes to existing functionality should be minimal and directly related to the requested feature.

## Validation

After making changes:

1. Check the affected routes and screens.
2. Check browser Back behavior.
3. Check navigation.
4. Check data loading.
5. Check localStorage behavior when relevant.
6. Check for horizontal overflow.
7. Verify that existing functionality still works.
8. Fix real problems found during validation.

Do not make unrelated improvements during the task.

## Working style

When a task is given:

1. First inspect the existing implementation.
2. Identify the smallest set of files that need to change.
3. Implement the requested feature.
4. Validate the result.
5. Fix real issues.
6. Report what was changed and what was verified.

Do not expand the scope of the task unless explicitly requested.
