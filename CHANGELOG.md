# Changelog

## 1.1.2

### Fixed

- Moved the static-model merge into `ZAIProvider.getAvailableModels` (the method the host actually invokes via `createLLMProvider`). In 1.1.1 the merge was only in the plugin-level wrapper, which the server bypasses, so vision models were still missing from the chat picker.

## 1.1.1

### Fixed

- Vision-capable models (`glm-4.5v`, `glm-4.6v`, `glm-4.6v-flashx`, `glm-4.6v-flash`, `glm-5v-turbo`) are now surfaced in the chat model picker even when Z.AI's `/models` endpoint omits them. `getAvailableModels` unions the API response with the static model catalog and filters out image-generation IDs, which are owned by the image provider.

## 1.1-dev

### Added

- Added new vision models: `glm-4.6v-flashx`, `glm-4.6v-flash`, and `glm-5v-turbo`.
- Added allow-listed passthrough for Z.AI-specific `thinking` and `do_sample` parameters via `LLMParams.profileParameters`.

### Changed

- Raised `glm-4.6v` `maxOutputTokens` from 16384 to 32768.

## 1.0.0

- Initial release.
