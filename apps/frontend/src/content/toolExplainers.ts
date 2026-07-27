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
    subtitle: 'One place to review available policy records, renewal context, and loss-prevention actions.',
    whatItDoes: {
      statement:
        'This workspace shows what the Home Record currently knows and identifies questions worth confirming before a coverage decision.',
    },
    howItWorks: [
      {
        title: 'Review current records',
        description: 'See linked policies, declarations, warranties, and the facts currently available.',
      },
      {
        title: 'Identify record questions',
        description: 'Find missing or incomplete evidence without treating missing records as proof of no coverage.',
      },
      {
        title: 'Prepare for renewal',
        description: 'Review modeled regional context separately from actual policy history or quotes.',
      },
      {
        title: 'Reduce loss risk',
        description: 'Plan practical mitigation work without promising a premium change.',
      },
      {
        title: 'Confirm consequential choices',
        description: 'Use controlling policy language or a licensed insurance professional for coverage decisions.',
      },
    ],
    whyItsSmart: [
      'Keeps policy records, questions, renewal context, and mitigation together',
      'Separates confirmed facts from modeled context',
      'Preserves source and launch context across stages',
      'Keeps consequential decisions with the homeowner',
    ],
    whenToUseIt: [
      'Before renewal',
      'After adding or correcting a policy record',
      'After a material home change or loss-prevention project',
    ],
  },
};
