export default {
  branches: ["main"],
  plugins: [
    // Analyze commits using conventional commits
    "@semantic-release/commit-analyzer",

    // Generate release notes
    "@semantic-release/release-notes-generator",

    // Update per-package CHANGELOG.md (when executed per package via multi-semantic-release)
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],

    // Publish the current package (multi-semantic-release changes context per package)
    "@semantic-release/npm",

    // Commit updated CHANGELOG.md + package.json per released package
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json"],
        message: "chore(release): \${nextRelease.version} [skip ci]\n\n\${nextRelease.notes}",
      },
    ],

    // Create GitHub release
    "@semantic-release/github",
  ],
};
