export const NYC_DOF_BRONX_CLASS_1_RULE_V1 = {
  jurisdiction: {
    normalizedKey: 'US-NY-bronx',
    countryCode: 'US',
    stateCode: 'NY',
    countyName: 'Bronx',
    countyFips: '36005',
    municipality: 'Bronx',
    timezone: 'America/New_York',
  },
  profile: {
    slug: 'nyc-bronx-tax-class-1-fy2027',
    version: 1,
    status: 'ACTIVE' as const,
    propertyClass: '1',
    taxYearLabel: '2026/2027',
    title: 'NYC Bronx Tax Class 1 — FY2027 reviewed rules',
    summary:
      'Reviewed NYC Department of Finance and Tax Commission rules for the Bronx Tax Class 1 pilot.',
    timezone: 'America/New_York',
    assessmentRatio: 0.06,
    valuationRulesJson: {
      valuationStatusDate: '2026-01-05',
      tentativeRollPublished: '2026-01-15',
      fiscalYearStarts: '2026-07-01',
      fiscalYearEnds: '2027-06-30',
    },
    classificationsJson: {
      included: ['NYC Tax Class 1'],
      description:
        'Primarily one-, two-, and three-family homes and qualifying small condominiums.',
    },
    capsJson: {
      annualAssessedValueIncreasePct: 6,
      fiveYearAssessedValueIncreasePct: 20,
      physicalChangesMayBeExcluded: true,
    },
    exemptionsJson: {
      categories: [
        'Senior Citizen Homeowners',
        'Disabled Homeowners',
        'Veterans',
        'Clergy',
        'STAR where applicable',
      ],
      eligibilityMustBeVerified: true,
    },
    correctionGroundsJson: {
      routes: [
        'Request for Review of market value',
        'Request to Update descriptive information',
        'Administrative review for clerical or factual errors',
      ],
      requestForReviewIsNotTaxCommissionAppeal: true,
    },
    appealGroundsJson: {
      supported: [
        'assessed value',
        'tax class',
        'qualifying exemption denial, revocation, or reduction',
      ],
      outcomePredictionAllowed: false,
    },
    stagesJson: {
      tentativeRoll: '2026-01-15',
      finalRollFiscalYear: 2027,
    },
    formsJson: {
      assessmentAppeal: ['TC108'],
      otherClaims: ['TC106'],
      marketValueReview: ['Request for Review — Tax Class 1'],
    },
    feesJson: {
      status: 'VERIFY_CURRENT_FORM_INSTRUCTIONS',
      amount: null,
    },
    officialLinksJson: {
      assessment:
        'https://www.nyc.gov/site/finance/property/property-assessments.page',
      challenge:
        'https://www.nyc.gov/site/finance/property/challenge-your-assessment.page',
      taxCommission:
        'https://www.nyc.gov/site/taxcommission/about/challenging-notice-of-property-value.page',
      forms:
        'https://www.nyc.gov/site/taxcommission/forms/application-forms.page',
    },
    qualificationJson: {
      boroughCode: '2',
      taxClass: '1',
      sourceSlug: 'nyc-dof-bronx-tax-class-1',
      requiresOfficialAssessmentMatch: true,
    },
    effectiveFrom: new Date('2026-01-15T05:00:00.000Z'),
    effectiveTo: new Date('2027-06-30T23:59:59.000Z'),
    reviewedAt: new Date('2026-07-27T12:00:00.000Z'),
    reviewerName: 'Contract to Cozy reviewed-source release',
    expiresAt: new Date('2027-01-14T23:59:59.000Z'),
  },
  citations: [
    {
      title: 'Challenge Your Assessment',
      publisher: 'NYC Department of Finance',
      officialUrl:
        'https://www.nyc.gov/site/finance/property/challenge-your-assessment.page',
      retrievedAt: new Date('2026-07-27T12:00:00.000Z'),
      effectiveAt: new Date('2026-01-15T05:00:00.000Z'),
      notes: 'Assessment challenge routes and Tax Class 1 filing deadline.',
    },
    {
      title: 'Challenging Notice of Property Value',
      publisher: 'NYC Tax Commission',
      officialUrl:
        'https://www.nyc.gov/site/taxcommission/about/challenging-notice-of-property-value.page',
      retrievedAt: new Date('2026-07-27T12:00:00.000Z'),
      effectiveAt: new Date('2026-01-15T05:00:00.000Z'),
      notes: 'Application forms, receipt requirement, and revised-notice exception.',
    },
    {
      title: 'Determining Your Assessed Value',
      publisher: 'NYC Department of Finance',
      officialUrl:
        'https://www.nyc.gov/site/finance/property/property-determining-your-assessed-value.page',
      retrievedAt: new Date('2026-07-27T12:00:00.000Z'),
      notes: 'Class 1 assessment ratio and annual/five-year caps.',
    },
  ],
  deadlines: [
    {
      code: 'TC_CLASS_1_ASSESSMENT_APPEAL_FY2027',
      type: 'ASSESSMENT_APPEAL' as const,
      label: 'Tax Commission assessment appeal',
      trigger: 'FIXED_INSTANT' as const,
      fixedDeadlineAt: new Date('2026-03-16T21:00:00.000Z'),
      daysAfterNotice: null,
      cutoffLocalTime: '17:00',
      timezone: 'America/New_York',
      submissionRequirement:
        'The Tax Commission must receive the application by the deadline.',
      officialUrl:
        'https://www.nyc.gov/site/taxcommission/about/challenging-notice-of-property-value.page',
      formCode: 'TC108',
      qualificationJson: {
        taxClass: '1',
        deadlineAdjustedFromWeekend: true,
      },
    },
    {
      code: 'DOF_CLASS_1_MARKET_VALUE_REVIEW_FY2027',
      type: 'MARKET_VALUE_REVIEW' as const,
      label: 'Department of Finance Request for Review',
      trigger: 'FIXED_INSTANT' as const,
      fixedDeadlineAt: new Date('2026-03-16T21:00:00.000Z'),
      daysAfterNotice: null,
      cutoffLocalTime: '17:00',
      timezone: 'America/New_York',
      submissionRequirement:
        'A Request for Review does not replace a Tax Commission appeal.',
      officialUrl:
        'https://www.nyc.gov/site/finance/property/property-forms-assessments-and-valuations.page',
      formCode: 'RFR_CLASS_1',
      qualificationJson: { taxClass: '1' },
    },
    {
      code: 'TC_REVISED_NOTICE_INCREASE_20_DAYS',
      type: 'ASSESSMENT_APPEAL' as const,
      label: 'Revised notice assessment appeal exception',
      trigger: 'DAYS_AFTER_NOTICE' as const,
      fixedDeadlineAt: null,
      daysAfterNotice: 20,
      cutoffLocalTime: '17:00',
      timezone: 'America/New_York',
      submissionRequirement:
        'Requires a qualifying revised notice dated after February 1 that increases assessed value or reduces/removes an exemption.',
      officialUrl:
        'https://www.nyc.gov/site/taxcommission/about/challenging-notice-of-property-value.page',
      formCode: 'TC108',
      qualificationJson: {
        requiresNoticeDate: true,
        requiresHomeownerQualificationConfirmation: true,
      },
    },
  ],
} as const;

export const REVIEWED_PROPERTY_TAX_RULES = [
  NYC_DOF_BRONX_CLASS_1_RULE_V1,
] as const;
