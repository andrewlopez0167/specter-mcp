# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
