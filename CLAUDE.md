# CLAUDE.md - AI Assistant Guidelines for Product Manager AI

## Project Overview

**Product Manager AI** is an AI-powered product management assistant designed to help with product development workflows, feature prioritization, roadmap planning, and stakeholder communication.

> **Note**: This is a newly initialized repository. Update this document as the codebase evolves.

## Repository Structure

```
product-manager-ai/
├── CLAUDE.md           # AI assistant guidelines (this file)
├── README.md           # Project documentation
├── src/                # Source code
│   ├── index.ts        # Application entry point
│   ├── api/            # API routes and handlers
│   ├── services/       # Business logic and AI services
│   ├── models/         # Data models and types
│   ├── utils/          # Utility functions
│   └── config/         # Configuration management
├── tests/              # Test files
├── docs/               # Documentation
├── scripts/            # Build and deployment scripts
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── .env.example        # Environment variables template
```

## Development Workflow

### Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Git Workflow

1. **Branch Naming Convention**:
   - Feature branches: `feature/<description>`
   - Bug fixes: `fix/<description>`
   - AI assistant branches: `claude/<session-id>`

2. **Commit Message Format**:
   ```
   <type>(<scope>): <description>

   [optional body]

   [optional footer]
   ```
   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

3. **Pull Request Guidelines**:
   - Include clear description of changes
   - Reference related issues
   - Ensure all tests pass
   - Request review from maintainers

## Code Conventions

### TypeScript Standards

- Use TypeScript strict mode
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for public functions
- Avoid `any` type; use `unknown` when type is truly unknown

```typescript
// Good
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

function getUserById(id: string): Promise<UserProfile | null> {
  // implementation
}

// Avoid
function getData(params: any): any {
  // implementation
}
```

### File Organization

- One component/class per file
- Group related files in feature directories
- Keep files under 300 lines when possible
- Use barrel exports (`index.ts`) for clean imports

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Classes/Interfaces**: PascalCase (`UserService`, `UserProfile`)
- **Functions/Variables**: camelCase (`getUserById`, `currentUser`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Environment Variables**: SCREAMING_SNAKE_CASE (`DATABASE_URL`)

### Error Handling

- Use custom error classes for domain-specific errors
- Always include context in error messages
- Log errors with appropriate severity levels
- Never expose internal errors to end users

```typescript
class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}
```

## Testing Guidelines

### Test Structure

```typescript
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('should return null when user not found', async () => {
      // test implementation
    });
  });
});
```

### Test Coverage Requirements

- Aim for 80%+ code coverage
- All critical paths must have tests
- Include unit, integration, and e2e tests as appropriate

## AI Assistant Instructions

### When Working on This Codebase

1. **Read Before Modifying**: Always read existing files before making changes
2. **Follow Existing Patterns**: Match the style and patterns already in the codebase
3. **Minimal Changes**: Only make changes directly related to the task
4. **Test Your Changes**: Run tests after making modifications
5. **Document Significant Changes**: Update relevant documentation

### Common Tasks

#### Adding a New Feature
1. Create feature branch
2. Implement in appropriate directory under `src/`
3. Add corresponding tests in `tests/`
4. Update types/interfaces as needed
5. Run full test suite
6. Commit with descriptive message

#### Fixing a Bug
1. Identify the root cause by reading relevant code
2. Write a failing test that reproduces the bug
3. Implement the fix
4. Verify the test passes
5. Check for regressions in related functionality

#### Code Review Preparation
1. Ensure all tests pass
2. Run linting: `npm run lint`
3. Format code: `npm run format`
4. Self-review the diff before committing

### Security Considerations

- Never commit secrets or API keys
- Use environment variables for sensitive configuration
- Validate all user inputs
- Sanitize data before database operations
- Follow OWASP security guidelines

### Performance Best Practices

- Use async/await for I/O operations
- Implement pagination for list endpoints
- Cache frequently accessed data when appropriate
- Avoid N+1 query patterns
- Profile before optimizing

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | No (default: 3000) |
| `DATABASE_URL` | Database connection string | Yes |
| `API_KEY` | External API key | Yes |
| `LOG_LEVEL` | Logging verbosity | No (default: info) |

## Dependencies

### Core Dependencies
- Runtime and framework dependencies go here

### Development Dependencies
- Testing, linting, and build tools go here

## Troubleshooting

### Common Issues

1. **Build fails with type errors**
   - Run `npm run typecheck` to see detailed errors
   - Ensure all dependencies are installed

2. **Tests fail locally but pass in CI**
   - Check for environment-specific configurations
   - Ensure test database is properly set up

3. **Hot reload not working**
   - Clear the build cache: `npm run clean`
   - Restart the development server

## Contact & Resources

- **Repository**: product-manager-ai
- **Documentation**: See `docs/` directory
- **Issues**: Report bugs via GitHub Issues

---

*Last updated: 2026-02-03*
*This document should be updated as the project evolves.*
