# Employee of the Month removal

Removed admin and crew screens, routes, module identifiers, service, types,
access-matrix entries, maintenance deletion entry, and new-tenant defaults.
Removed collection grants from all three Firestore rules sources so default
deny applies when the appropriate rules are separately published.

No production rule publication or data deletion is included in this local change.
Historical eom_cycles, eom_votes and eom_scores records remain intact. Existing
indexes and historical migration-script support are deliberately retained to
avoid destructive index operations or losing the ability to recover history.
Stored legacy access-matrix keys are inert; no production settings were edited.
Previously generated PDF guides/screenshots may still mention the retired module;
they are historical artifacts and should be refreshed in a documentation release.
