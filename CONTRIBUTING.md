# Contributing

Aurex is a local experimental platform. Keep changes focused and make model assumptions explicit. Public source visibility does not itself grant a general license; discuss substantial contributions or reuse with the repository owner before proceeding.

## Getting started

Follow the README quick start, then create a branch for your change. Do not commit generated simulations, virtual environments, dependencies, binaries, or build output.

## Required checks

```sh
./scripts/build-engine.sh
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm --prefix web run build
```

For interface changes, verify dark and light modes, desktop and narrow layouts, keyboard navigation, and the affected interaction from start to finish. Include screenshots in the pull request when useful.

For engine changes, add a test that exposes the behavior being corrected. Preserve deterministic ordering, cash/share conservation, reservations, and the rule that agents cannot observe future events. Update the engine version when behavior or reproducibility changes. Keep the model notes and API documentation consistent with the code.

Use conventional readable formatting: Black for Python, clang-format for C++, and Prettier for TypeScript/CSS. Do not reformat the vendored JSON header.

## Pull requests

Explain the problem, resulting behavior, assumptions, and checks performed. For experiment-related changes, include the exact configuration and seeds; one favorable run is not sufficient evidence of a strategy improvement.
