// components/orchestration/decisionTraceLabels.ts

export const TRACE_COPY = {
    header: {
      shown: 'Why you’re seeing this',
      suppressed: 'Why this action is hidden',
    },
  
    sectionTitle: 'How we decided this',
  
    learnWhy: 'See how this was decided',
  
    tooltip: {
      title: 'How this decision was made',
      body:
        'We evaluate several factors before showing an action—including the severity of the issue, whether it’s already covered by insurance or a warranty, and whether related work is already scheduled. This explanation shows the checks we performed and how they led to the final decision, so you always know why an action appears on your dashboard.',
    },
  
    plainRules: {
      RISK_ACTIONABLE: {
        title: 'This issue needs attention',
        description:
          'Your home assessment flagged this as important to address.',
        icon: '✅',
      },
      RISK_INFER_ASSET_KEY: {
        title: 'We identified the part of your home involved',
        description:
          'This action relates to a specific system or component.',
        icon: '🔍',
      },
      COVERAGE_MATCHING: {
        title: 'We checked your warranties and insurance',
        description:
          'No active coverage was found for this issue.',
        icon: '🛡',
      },
      COVERAGE_AWARE_CTA: {
        title: 'Your coverage was considered',
        description:
          'Coverage information was factored into the recommendation.',
        icon: '🛡',
      },
      BOOKING_SUPPRESSION: {
        title: 'We checked for existing scheduled work',
        description:
          'There’s no current service already planned for this.',
        icon: '📅',
      },
      SUPPRESSION_FINAL: {
        title: 'Final decision made',
        description:
          'This action is shown because it still requires attention.',
        icon: '✅',
      },
      suppressedSummary: {
        BOOKING_EXISTS: {
          title: 'Work is already scheduled',
          description:
            'This action is hidden because there is already related work scheduled for your home.',
          icon: '📅',
        },
        COVERED: {
          title: 'This issue is already covered',
          description:
            'This action is hidden because it’s covered by an active warranty or insurance policy.',
          icon: '🛡',
        },
      }  
    },
  };
  