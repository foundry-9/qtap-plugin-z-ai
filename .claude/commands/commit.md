# Commit to Git

1. You must update the [changelog](../../CHANGELOG.md) for **every** git commit; no exceptions. If this is in the "bugfix" column, then it belongs in the next release section (if the last release was 3.1.2 then your changes probably belong in a 3.1.3 section), otherwise put it in the next dev section (if the last release was 3.1.2, then your changes probably belong in a 3.2-dev section).
2. You must bump the package.json and manifest.json version numbers to be identical, appropriate to the change.
3. If you have not already done so, it is worth running the following commands before the commit just to be sure it won't trip you up:

    - `npm run build`

4. Please don't credit yourself in the commit message.
5. After this, you can commit.
