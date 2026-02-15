# Readme

Summary: Phishing Lens is a real-time phishing detection layer that intercepts newly opened links and evaluates them before users interact with the page. By combining brand impersonation analysis, content-based social engineering signals, credential harvesting detection, and redirect tracing, we generate a clear 1–10 suspiciousness score in seconds. It's a PC application that acts as the default browser, in order to intercept harmful links before affecting users.

## Onboarding

see [contribution](CONTRIBUTING.md).

You are suppose to run this before commit to save CI time:

```shell
sh scripts/pre-commit-check.sh
```

[features.md](docs/features.md) contains all the high-level documents.

[implementations.md](docs/implementations.md) contains all the implementations for features.md.

[tasks.md](docs/tasks.md) contains the discrete tasks.
