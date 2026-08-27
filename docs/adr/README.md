# Architecture decision records

One file per decision. Numbered, and immutable once accepted — a reversal is a new ADR that supersedes the old one, not an edit.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-two-loop-split.md) | Two-loop split — no model in the per-frame path | Accepted |
| [0002](0002-video-never-leaves-device.md) | Video never leaves the device | Accepted |
| [0003](0003-vendor-openrehabagent.md) | Vendor OpenRehabAgent rather than depend on it | Accepted |
| [0004](0004-deterministic-progression-first.md) | Deterministic progression policy before a learned one | Accepted |
| [0005](0005-one-codebase-two-roles.md) | One codebase for patient and clinician through M5 | Accepted |
| [0006](0006-regulatory-posture.md) | Regulatory posture and data residency | **Open — blocking** |
| [0007](0007-pose-model-tier.md) | Pose model tier and device floor | Open |
| [0008](0008-dataset-terms.md) | Academic dataset terms for commercial CI | Open |

**Format:** context, decision, consequences, and what would make us revisit. Keep them short — an ADR nobody reads is worse than no ADR.
