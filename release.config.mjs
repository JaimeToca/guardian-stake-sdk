export default {
  branches: ["main"],
  plugins: [
    // Analyze commits using conventional commits
    "@semantic-release/commit-analyzer",

    // Generate release notes
    "@semantic-release/release-notes-generator",

    // Update CHANGELOG.md
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
        changelogTitle:
          "# Changelog\n\n> All notable changes to Guardian SDK packages are documented here.\n> Versions follow [Semantic Versioning](https://semver.org/).\n>\n> **Disclaimer:** Guardian SDK is unaudited, experimental software provided AS-IS. See [SECURITY.md](./SECURITY.md) and [README.md](./README.md) for full disclaimer.",
      },
    ],

    // Publish @guardian/sdk
    [
      "@semantic-release/npm",
      {
        pkgRoot: "packages/sdk",
      },
    ],

    // Publish @guardian/bsc
    [
      "@semantic-release/npm",
      {
        pkgRoot: "packages/bsc",
      },
    ],

    // Commit updated CHANGELOG.md and package versions back to main
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "packages/sdk/package.json",
          "packages/bsc/package.json",
        ],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],

    // Create GitHub release
    "@semantic-release/github",
  ],
};
