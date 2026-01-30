# Project Guidelines for Claude

## Code Duplication

Before writing new functions, search for existing implementations that could be reused or extended. If similar logic exists in multiple places (e.g., browser vs Node.js versions), extract shared code into a common module.

Key shared modules:
- `src/comparison/panphon-distance-core.js` - Core distance calculation logic (used by both browser and Node.js)

## Testing

Node.js test files in `tests/` may need separate loaders for browser-only APIs (like JSON imports via Vite). Use dependency injection or factory patterns to share logic while allowing different data loading strategies.
