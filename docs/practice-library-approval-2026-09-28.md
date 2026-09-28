# Practice-library publication approval, September 28, 2026

Jacob explicitly authorized approval of the existing practice-library content in
the September 28 deployment follow-up, without requiring an outside or manual
reviewer. This record approves only the following exact archive for public release:

- Candidate source: `44d63968950c8dfac477d157b22d1e688156b8e3` (`v0.2.0`).
- Archive: `public/downloads/patent-drafting-practice-library-expanded.zip`.
- SHA-256: `1866160df86ed088decc8da7c6ca12170377b90eb4f2b1cd7b4d16897bb9cbb0`.

The archive is byte-for-byte unchanged from serving source
`864eeed898de2aa308dce4630e2d273b7bac88a4` (`v0.1.1`). The recursive archive,
PDF and Office safety checks passed; all 21 inventory entries, including ten
files, exactly match the reviewed manifest. The existing repository Actions
variable `PRACTICE_LIBRARY_APPROVED_SHA256` was read back and already contains
this exact digest. No credentials or tokens are part of this approval.

This is the owner's content approval, recorded by the source agent under that
authorization. Computing or matching a hash alone is not the approval basis.
No outside reviewer or new human-review claim is implied. Changes to archive
bytes require a new content approval; all existing build and host gates remain.

The operator can install this approved, nonsecret value in the existing policy
file as a root-owned regular file, mode `0600`, beneath real root-owned,
non-group/world-writable directories:

`/etc/deploy-policy/patentpractice.jacobdanderson.net/practice-library-approved.sha256`

The file must contain only the digest above and an optional newline. Then retry
the ordinary guarded deployment. This source approval does not itself install
the host file, activate a candidate, move a published tag, or clear quarantine.
