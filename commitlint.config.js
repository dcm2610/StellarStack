module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Type must be one of these
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation changes
        "style", // Code style changes (formatting, etc.)
        "refactor", // Code refactoring
        "test", // Test additions or updates
        "chore", // Maintenance tasks
        "perf", // Performance improvements
        "ci", // CI/CD changes
        "build", // Build system changes
        "revert", // Revert previous commit
      ],
    ],
    // Subject must not be empty
    "subject-empty": [2, "never"],
    // Type must not be empty
    "type-empty": [2, "never"],
    // Disable subject-case to allow Linear ticket IDs (STE-XXX)
    "subject-case": [0],
  },
};
