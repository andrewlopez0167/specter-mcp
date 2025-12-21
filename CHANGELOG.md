# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3](https://github.com/abd3lraouf/specter-mcp/compare/specter-mcp-v1.1.2...specter-mcp-v1.1.3) (2025-12-21)


### Bug Fixes

* Add npm environment to publish job for OIDC ([7998d09](https://github.com/abd3lraouf/specter-mcp/commit/7998d09b639c03bc56690c0eacf4debd6bce7326))

## [1.1.2](https://github.com/abd3lraouf/specter-mcp/compare/specter-mcp-v1.1.1...specter-mcp-v1.1.2) (2025-12-21)


### Bug Fixes

* Re-trigger release after CI improvements ([bd6742b](https://github.com/abd3lraouf/specter-mcp/commit/bd6742babd2c66991cf9c1c576f9c6bc9ceb8ab6))
* Remove tests from prepublishOnly hook ([1daf1a0](https://github.com/abd3lraouf/specter-mcp/commit/1daf1a08ace1e07f0e47a1625837b29553603f50))

## [1.1.1](https://github.com/abd3lraouf/specter-mcp/compare/specter-mcp-v1.1.0...specter-mcp-v1.1.1) (2025-12-21)


### Bug Fixes

* Trigger release after CI workflow updates ([de54f8d](https://github.com/abd3lraouf/specter-mcp/commit/de54f8da57a1756c6df7ae19b3b128d4e5a0f2f1))

## [1.1.0](https://github.com/abd3lraouf/specter-mcp/compare/specter-mcp-v1.0.0...specter-mcp-v1.1.0) (2025-12-21)


### Features

* Comprehensive test coverage for Android tools and test app E2E ([8a83a1e](https://github.com/abd3lraouf/specter-mcp/commit/8a83a1ee5c35987ec57405e0a2e5782c60882804))
* Cross-platform crash analysis with live device log support ([88c9ef0](https://github.com/abd3lraouf/specter-mcp/commit/88c9ef092270cabc3e92882cc2ea9cce779aec68))
* Specter MCP v1.0.0 - KMM Diagnostic & Execution Engine ([c73e9bf](https://github.com/abd3lraouf/specter-mcp/commit/c73e9bf28704b5e74526ddc34206bf0453ec9765))


### Bug Fixes

* Binary screenshot capture, iOS interactions, and test cleanup ([cb9b0bd](https://github.com/abd3lraouf/specter-mcp/commit/cb9b0bd7d8dd6e5bab800fe582a7577d28243239))
* Cross-platform Maestro E2E tests and improved README ([92ee2f1](https://github.com/abd3lraouf/specter-mcp/commit/92ee2f1ab2c04d15e23da7689a0609275fd80e24))
* Improve crash detection and parallel test execution ([4ba7f13](https://github.com/abd3lraouf/specter-mcp/commit/4ba7f138fc7d30cbd250f274f8b0649ea4ee4ad2))
* Make tests stricter and fix iOS configuration ([5070dc4](https://github.com/abd3lraouf/specter-mcp/commit/5070dc4b4f6abfcffc362dd0d50cb4622175f1e3))
* Update tests for deviceId parameter and fix package.json ([6ae6b8a](https://github.com/abd3lraouf/specter-mcp/commit/6ae6b8a9cd265acd2434b91a808c1b3c107a10b1))

## [1.0.0] - 2024-12-21

### Added

- Initial release of Specter MCP
- **Build Tools**: `build_app`, `install_app`, `launch_app`
- **UI Tools**: `get_ui_context`, `interact_with_ui`
- **Testing Tools**: `run_unit_tests`, `run_maestro_flow`, `run_linter`
- **Environment Tools**: `list_devices`, `manage_env`, `clean_project`
- **Observability Tools**: `analyze_crash`, `inspect_logs`, `inspect_app_state`, `deep_link_navigate`
- Support for Android (ADB, Gradle) and iOS (simctl, xcodebuild)
- iOS crash log parsing and symbolication
- Maestro E2E test integration
- Sequential request queue to prevent resource conflicts
- Comprehensive error handling with actionable suggestions
- Full documentation and API reference
