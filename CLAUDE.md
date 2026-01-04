# briefcast - Claude Code Guide

## Project Overview

Welcome to the briefcast project! This guide helps Claude Code understand the project structure, conventions, and development workflow.

## Project Structure

```
briefcast/
├── .specflow/           # SpecFlow workflow configuration
│   ├── config.yaml      # SpecFlow settings
│   ├── constitution.md  # Project principles and standards
│   └── specflow.db      # Workflow state database
├── specs/               # Generated specifications
├── .claude/             # Claude Code configuration
│   ├── agents/          # Custom agent definitions
│   ├── commands/        # Custom commands
│   ├── skills/          # Custom skills
│   └── hooks/           # Lifecycle hooks
└── src/                 # Source code (to be organized)
```

## Development Workflow

### Using SpecFlow

This project uses SpecFlow for structured development:

1. **Specify** (`/specflow.specify`): Define requirements and create specifications
2. **Plan** (`/specflow.plan`): Create technical implementation plans
3. **Implement** (`/specflow.implement`): Execute autonomous implementation
4. **QA** (`/specflow.qa`): Validate against specifications

### Commands

- `/specflow.brd` - Create Business Requirements Document
- `/specflow.prd` - Create Product Requirements Document
- `/specflow.ingest` - Ingest existing BRD/PRD
- `/specflow.specify` - Generate specification from requirements
- `/specflow.plan` - Create implementation plan
- `/specflow.tasks` - Decompose plan into executable tasks
- `/specflow.implement` - Execute implementation
- `/specflow.qa` - Run QA validation

## Coding Standards

### General Principles

- Follow the constitution in `.specflow/constitution.md`
- Write clear, self-documenting code
- Test all new functionality
- Keep changes focused and atomic

### Code Style

- [Define language-specific style guides]
- [Naming conventions]
- [File organization patterns]

### Testing

- Write tests for all new features
- Maintain minimum 80% coverage
- Test edge cases and error conditions

## Architecture

### Technology Stack

- [List key technologies]
- [Framework versions]
- [Important dependencies]

### Design Patterns

- [Preferred patterns]
- [Anti-patterns to avoid]

### Data Models

- [Database schema overview]
- [Key entities and relationships]

## Common Tasks

### Adding a New Feature

1. Use `/specflow.specify` to create specification
2. Review and approve the spec
3. Use `/specflow.plan` to create implementation plan
4. Use `/specflow.implement` to execute
5. Use `/specflow.qa` to validate

### Running Tests

```bash
# Add test commands here
```

### Building

```bash
# Add build commands here
```

### Deployment

```bash
# Add deployment commands here
```

## Troubleshooting

### Common Issues

- [List common problems and solutions]

### Getting Help

- Check `.specflow/constitution.md` for project standards
- Review existing specifications in `specs/`
- Consult project documentation

## Resources

- [Link to external docs]
- [API documentation]
- [Design documents]

---

Last updated: 2026-01-04
