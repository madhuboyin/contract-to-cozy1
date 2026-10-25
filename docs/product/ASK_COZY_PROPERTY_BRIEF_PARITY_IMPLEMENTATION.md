# Ask Cozy Property Brief parity

This is the Property Brief detail appendix to the all-tools register in [`ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md`](ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md).

Ask Cozy's Property Brief capability now supports the complete governed lifecycle previously available only on the traditional Property Brief page.

`PROPERTY_BRIEFS_LIST` remains the viewer-safe read. It lists saved briefs and can now open the exact frozen recipient snapshot inline. The preview preserves included and excluded sections, source labels, verification states, as-of dates, sensitive-section labels, the limitation statement, and controlled-link history. Recipient names and email addresses remain out of the conversation transcript.

`PROPERTY_BRIEF_COMMAND` is a declared-action-only material command requiring the `CONTRIBUTOR` household role. It supports:

- preparing a brief from a recipient-purpose template, selected sections, and explicitly selected verified documents;
- acknowledging sensitive sections before snapshot creation;
- creating a 1–90 day controlled share with view-only or download permission and an optional emailed invitation;
- testing a selected live link without incrementing recipient access or accepting an invitation;
- revoking a selected live link;
- checking canonical records for changes and republishing only when selected-section content changed.

Every mutation uses the existing Property Brief contracts and `propertyBrief.service`. Preparation, external sharing, revocation, and republishing are confirmation-gated. Sharing retains the existing material-privacy and household-consent checks. Republish preserves the existing link identity, changes recipient-visible content only when the section diff is non-empty, and queues the same recipient update notices as the traditional route.

Raw share tokens are returned only in the creation receipt. Cozy stores only a token hash, so an earlier raw link is never presented as recoverable.

In the inline recipient preview, writable rows in **Known gaps and unknowns** are checked against the live Property Context before an action is offered. A fact that is still unresolved offers **Add detail** to contributors and owners and launches the existing confirmation-gated area capture. If the fact has since been recorded, the frozen row says so and offers **Refresh brief** instead of opening an empty capture session. Viewers and non-writable gaps remain read-only. Saving changes the canonical home record, never the frozen brief; republishing remains the explicit, confirmation-gated path for replacing recipient-visible snapshot content.
