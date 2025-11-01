# Agent Guidelines for edge-referral-server

## Build/Test/Lint Commands

- `yarn prepare` - Build TypeScript to lib/ and /dist
- `yarn test` - Run all tests with Mocha
- `yarn lint` - Run ESLint on all files
- `yarn fix` - Auto-fix ESLint issues
- `yarn types` - Run TypeScript type checking
- `yarn start` - Start development server with Sucrase
- Single test: `npx mocha -r sucrase/register 'test/specific-test.ts'`

## Code Style

- Uses TypeScript with strict mode enabled
- ESLint with standard-kit/prettier config
- Import sorting with simple-import-sort plugin (alphabetical)
- Prettier for formatting
- Use `async/await` over Promises
- Prefer `const` over `let`, never `var`
- Use explicit return types for functions
- Error handling with try/catch blocks

## Project Structure

- Source: `src/` (TypeScript)
- Server build output: `lib/` (JavaScript)
- Client build output: `dist/` (Javascript)
- Tests: `src/__tests__/` (Mocha with Chai)
- Database modules: `src/db/`
- Routes: `src/routes/`
- Types: `src/types/`
