export type ToolExplainerKey =
  | 'doNothingSimulator'
  | 'riskToPremiumOptimizer'
  | 'coverageIntelligence';

export interface ToolExplainerStep {
  title: string;
  description: string;
}

export interface ToolExplainer {
  subtitle?: string;
  whatItDoes: {
    statement: string;
    supportingLine?: string;
  };
  howItWorks: ToolExplainerStep[];
  whyItsSmart: string[];
  whenToUseIt: string[];
}

export const TOOL_EXPLAINERS: Record<ToolExplainerKey, ToolExplainer> = {
  doNothingSimulator: {
    subtitle: 'A quick, transparent overview of how we generate your results.',
    whatItDoes: {
      statement:
        'This tool shows the financial impact of delaying maintenance - so you can see how small issues grow into bigger costs.',
    },
    howItWorks: [
      {
        title: 'Select the issue',
        description: "Choose the repair, risk, or home item you're evaluating.",
      },
      {
        title: "Estimate today's cost",
        description: 'We calculate the current repair or replacement cost based on your home data.',
      },
      {
        title: 'Project cost growth',
        description: 'We model how costs rise over time using inflation and common escalation patterns.',
      },
      {
        title: 'Simulate failure risk',
        description: 'We estimate how the probability of failure increases as time passes.',
      },
      {
        title: 'Compare scenarios',
        description: 'See proactive vs delayed outcomes side-by-side, including cost ranges.',
      },
    ],
    whyItsSmart: [
      'Models compounding risk over time',
      'Includes inflation and cost escalation',
      'Shows best-case and worst-case ranges',
      'Highlights the cost of inaction clearly',
    ],
    whenToUseIt: [
      "When you're debating whether to repair now or later",
      'When planning a maintenance budget for the next 6-12 months',
      'Before ignoring a recurring issue',
    ],
  },
  riskToPremiumOptimizer: {
    subtitle: 'A quick, transparent overview of how we generate your results.',
    whatItDoes: {
      statement:
        'This tool finds ways to reduce premium pressure without increasing your risk exposure.',
    },
    howItWorks: [
      {
        title: 'Review your protection profile',
        description: 'We look at your current coverage, deductibles, and gaps.',
      },
      {
        title: 'Identify premium drivers',
        description: 'We detect the factors most likely contributing to higher premiums.',
      },
      {
        title: 'Model adjustment scenarios',
        description: 'We simulate coverage/deductible changes and estimate impacts.',
      },
      {
        title: 'Balance cost vs risk',
        description: 'We recommend options that lower cost while keeping protection strong.',
      },
      {
        title: 'Show expected outcomes',
        description: 'You see estimated savings and any tradeoffs, in plain language.',
      },
    ],
    whyItsSmart: [
      'Explains tradeoffs instead of hiding them',
      'Detects under/over-insured areas',
      'Simulates multiple scenarios quickly',
      'Focuses on balanced optimization',
    ],
    whenToUseIt: [
      'During renewal season',
      'After a premium increase',
      'After major purchases or home upgrades',
    ],
  },
  coverageIntelligence: {
    subtitle: 'A quick, transparent overview of how we generate your results.',
    whatItDoes: {
      statement:
        'This tool checks your insurance + warranties against your home inventory to find protection gaps and improve claims readiness.',
    },
    howItWorks: [
      {
        title: 'Review connected coverage',
        description: 'We analyze uploaded policies, declarations, and warranties.',
      },
      {
        title: 'Map coverage to items',
        description: 'We match coverage against each tracked home item.',
      },
      {
        title: 'Detect gaps and overlaps',
        description: 'We flag uncovered items and redundant coverage.',
      },
      {
        title: 'Assess claims readiness',
        description: 'We check if key docs are attached for smoother claims.',
      },
      {
        title: 'Recommend next steps',
        description: 'We suggest exactly what to fix and why.',
      },
    ],
    whyItsSmart: [
      'Connects coverage to the actual things you own',
      'Finds uncovered high-value items',
      'Improves claims readiness with document checks',
      'Surfaces savings opportunities',
    ],
    whenToUseIt: [
      'After adding new items',
      'Before filing a claim',
      'When reviewing policies or warranties',
    ],
  },
};
